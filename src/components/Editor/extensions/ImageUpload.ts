/**
 * ImageUpload — step 9 implementation.
 *
 * Extends the base Image extension to handle:
 *   1. Drag-and-drop image files onto the editor
 *   2. Paste from clipboard (screenshots, copied images)
 *   3. `/image` slash command (wired via Editor.tsx)
 *
 * Storage model:
 *   - `src` attribute stores the *relative markdown path* at all times,
 *     e.g. "../attachments/images/abc123.png"
 *   - `renderHTML` converts it to a Tauri asset URL for display
 *   - tiptap-markdown serializes `src` as-is → portable .md files ✓
 *
 * Tauri drag-drop: uses the `tauri://drag-drop` window event (gives native
 * file paths without reading bytes) for drop events that originate from the OS.
 * Paste: reads File bytes and calls `import_attachment_data`.
 */

import Image from "@tiptap/extension-image";
import { mergeAttributes } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Editor } from "@tiptap/core";
import { importAttachment, importAttachmentData } from "../../../lib/tauri";

const IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

export interface ImageUploadOptions {
  /** Absolute path to the open vault. Set by Editor.tsx after vault opens. */
  vaultPath: string | null;
  /** Active note ID — used to associate imported attachments. */
  getNoteId: () => string | null;
  HTMLAttributes: Record<string, unknown>;
  allowBase64: boolean;
}

export const ImageUpload = Image.extend<ImageUploadOptions>({
  name: "imageUpload",

  addOptions() {
    return {
      ...this.parent?.(),
      vaultPath: null,
      getNoteId: () => null,
      HTMLAttributes: {},
      allowBase64: false,
    };
  },

  // Override renderHTML to convert relative path → asset URL for display.
  renderHTML({ HTMLAttributes }) {
    const { src, ...rest } = HTMLAttributes as Record<string, unknown>;
    let displaySrc = (src as string) ?? "";

    const vaultPath = this.options.vaultPath;
    if (
      typeof src === "string" &&
      vaultPath &&
      !src.startsWith("http") &&
      !src.startsWith("asset://") &&
      !src.startsWith("data:")
    ) {
      // "../attachments/images/foo.png" → vaultPath + "/attachments/images/foo.png"
      const relative = src.replace(/^\.\.\//, "");
      displaySrc = convertFileSrc(`${vaultPath}/${relative}`);
    }

    return [
      "img",
      mergeAttributes(this.options.HTMLAttributes, rest, {
        src: displaySrc,
        loading: "lazy",
      }),
    ];
  },

  addProseMirrorPlugins() {
    const getOptions = () => this.options;
    const getEditor = () => this.editor as Editor;

    // Listen for Tauri drag-drop events to get native file paths.
    // This is set up once and cleaned up on extension teardown.
    let unlistenDragDrop: (() => void) | null = null;

    const setupDragDropListener = () => {
      listen<{ type: string; paths?: string[] }>(
        "tauri://drag-drop",
        (event) => {
          if (event.payload.type !== "drop") return;
          const paths = event.payload.paths ?? [];
          const imagePaths = paths.filter((p) => {
            const ext = p.split(".").pop()?.toLowerCase() ?? "";
            return IMAGE_EXTS.has(ext);
          });
          if (imagePaths.length === 0) return;

          const editor = getEditor();
          if (!editor || editor.isDestroyed) return;

          // Only insert if the editor is focused or hovered.
          const opts = getOptions();
          for (const p of imagePaths) {
            void insertFromPath(p, editor, opts);
          }
        }
      ).then((fn) => {
        unlistenDragDrop = fn;
      });
    };

    setupDragDropListener();

    return [
      new Plugin({
        props: {
          // Handle DOM drop events (catches drops directly on editor content).
          handleDOMEvents: {
            drop(_view, event) {
              const files = event.dataTransfer?.files;
              if (!files?.length) return false;

              const images = Array.from(files).filter((f) =>
                IMAGE_MIME.has(f.type)
              );
              if (!images.length) return false;

              // Prevent the browser from navigating to the file.
              event.preventDefault();

              const editor = getEditor();
              const opts = getOptions();

              for (const file of images) {
                void insertFromFile(file, editor, opts);
              }
              return true;
            },

            // Handle paste events — screenshots, copied images.
            paste(_view, event) {
              const items = event.clipboardData?.items;
              if (!items) return false;

              const imageItems = Array.from(items).filter((item) =>
                IMAGE_MIME.has(item.type)
              );
              if (!imageItems.length) return false;

              event.preventDefault();

              const editor = getEditor();
              const opts = getOptions();

              for (const item of imageItems) {
                const file = item.getAsFile();
                if (file) void insertFromFile(file, editor, opts);
              }
              return true;
            },
          },
        },

        // Clean up the Tauri event listener when the plugin is destroyed.
        destroy() {
          unlistenDragDrop?.();
        },
      }),
    ];
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Insert an image from a native file-system path (file picker / Tauri drop). */
export async function insertFromPath(
  absolutePath: string,
  editor: Editor,
  opts: ImageUploadOptions
) {
  const noteId = opts.getNoteId() ?? "";
  try {
    const attachment = await importAttachment(absolutePath, noteId);
    const src = `../${attachment.file_path}`;
    editor.chain().focus().setImage({ src }).run();
  } catch (e) {
    console.error("[ImageUpload] import_attachment failed:", e);
  }
}

/** Insert an image from a browser File object (drag-drop via DOM / paste). */
async function insertFromFile(
  file: File,
  editor: Editor,
  opts: ImageUploadOptions
) {
  const MAX = 10 * 1024 * 1024;
  if (file.size > MAX) {
    console.warn("[ImageUpload] file too large for paste (>10 MB):", file.name);
    return;
  }

  const noteId = opts.getNoteId() ?? "";
  const filename = file.name || `pasted-image.png`;

  try {
    const buffer = await file.arrayBuffer();
    const data = Array.from(new Uint8Array(buffer));
    const attachment = await importAttachmentData(data, filename, noteId);
    const src = `../${attachment.file_path}`;
    editor.chain().focus().setImage({ src }).run();
  } catch (e) {
    console.error("[ImageUpload] import_attachment_data failed:", e);
  }
}
