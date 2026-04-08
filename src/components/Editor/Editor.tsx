import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Typography from "@tiptap/extension-typography";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TextAlign from "@tiptap/extension-text-align";
import CharacterCount from "@tiptap/extension-character-count";
import Focus from "@tiptap/extension-focus";
import { createLowlight, common } from "lowlight";
import { Markdown } from "tiptap-markdown";

import { WikiLink, registerWikiLinkDispatch, wikiLinkKey } from "./extensions/WikiLink";
import { SlashCommands, registerImageRequestHandler } from "./extensions/SlashCommands";
import { Callout } from "./extensions/Callout";
import { ImageUpload, insertFromPath } from "./extensions/ImageUpload";
import { EditorToolbar } from "./EditorToolbar";
import { useNote } from "../../hooks/useNote";
import { useNoteStore } from "../../store/noteStore";
import "./EditorStyles.css";

import { open } from "@tauri-apps/plugin-dialog";

const lowlight = createLowlight(common);

// tiptap-markdown adds `markdown` to editor storage but doesn't ship types.
type MarkdownStorage = { getMarkdown(): string };

interface Props {
  noteId: string | null;
}

export function Editor({ noteId }: Props) {
  // Stable ref so the onUpdate closure always calls the latest scheduleSave.
  const scheduleSaveRef = useRef<((content: string) => void) | undefined>(undefined);

  // Bubble menu state — position + visibility driven by DOM selection.
  const [bubbleRect, setBubbleRect] = useState<DOMRect | null>(null);

  const { setActiveNote, createNote, workspace } = useNoteStore();
  const vaultPath = workspace?.vault_path ?? null;

  // Stable refs for WikiLink callbacks so closures stay current without
  // recreating the editor on every store update.
  const onNavigateRef = useRef<(id: string) => void>((id) => setActiveNote(id));
  const onCreateNoteRef = useRef<(title: string) => void>((title) => createNote(title));
  onNavigateRef.current = (id) => setActiveNote(id);
  onCreateNoteRef.current = (title) => { void createNote(title); };

  // Keep a ref to the current noteId so ImageUpload closures stay fresh.
  const noteIdRef = useRef<string | null>(noteId);
  noteIdRef.current = noteId;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // CodeBlockLowlight replaces the default code block.
        codeBlock: false,
      }),
      Typography,
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === "heading") return "Heading";
          return "Write something, or press / for commands…";
        },
        showOnlyCurrent: true,
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: "plaintext",
        HTMLAttributes: { class: "code-block" },
      }),
      ImageUpload.configure({
        HTMLAttributes: { class: "editor-image" },
        allowBase64: false,
        vaultPath,
        getNoteId: () => noteIdRef.current,
      }),
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Highlight,
      Underline,
      Subscript,
      Superscript,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      CharacterCount,
      Focus,
      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: "-",
        linkify: false,
        breaks: false,
      }),
      WikiLink.configure({
        onNavigate: (id) => onNavigateRef.current(id),
        onCreateNote: (title) => onCreateNoteRef.current(title),
      }),
      SlashCommands,
      Callout,
    ],

    editorProps: {
      attributes: { class: "tiptap", spellcheck: "true" },
    },

    onUpdate: ({ editor }) => {
      const store = editor.storage as unknown as Record<string, unknown>;
      const md = (store["markdown"] as MarkdownStorage).getMarkdown();
      scheduleSaveRef.current?.(md);
    },

    onSelectionUpdate: ({ editor }) => {
      if (editor.state.selection.empty || editor.isActive("codeBlock")) {
        setBubbleRect(null);
        return;
      }
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) { setBubbleRect(null); return; }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      // Ignore zero-area rects (e.g. collapsed selection).
      if (rect.width === 0 && rect.height === 0) { setBubbleRect(null); return; }
      setBubbleRect(rect);
    },

    onBlur: () => setBubbleRect(null),

    content: "",
  });

  const { saveStatus, scheduleSave } = useNote(noteId, editor);
  scheduleSaveRef.current = scheduleSave;

  // Register WikiLink dispatch so the async resolver can push meta transactions
  // back into the editor view.
  useEffect(() => {
    if (!editor) return;
    registerWikiLinkDispatch((resolved) => {
      if (editor.isDestroyed) return;
      const tr = editor.state.tr.setMeta(wikiLinkKey, resolved);
      editor.view.dispatch(tr);
    });
    return () => registerWikiLinkDispatch(() => {});
  }, [editor]);

  // Register the /image slash command handler — opens a file picker then imports.
  useEffect(() => {
    registerImageRequestHandler(async () => {
      if (!editor || editor.isDestroyed) return;
      const selected = await open({
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"],
          },
        ],
        multiple: false,
      });
      if (!selected || typeof selected !== "string") return;
      const opts = {
        vaultPath,
        getNoteId: () => noteIdRef.current,
        HTMLAttributes: {},
        allowBase64: false,
      };
      await insertFromPath(selected, editor, opts);
    });
  }, [editor, vaultPath]);

  // Destroy editor on unmount.
  useEffect(() => () => { editor?.destroy(); }, [editor]);

  if (!noteId) {
    return (
      <div className="editor-empty-state">
        Select a note or press + to create one.
      </div>
    );
  }

  const editorStore = editor?.storage as unknown as Record<string, unknown> | undefined;
  const wordCount = (editorStore?.["characterCount"] as { words(): number } | undefined)?.words() ?? 0;
  const readingMins = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <div className="editor-wrapper">
      {/* Floating bubble menu — portal so it escapes overflow:hidden parents */}
      {editor && bubbleRect &&
        createPortal(
          <div
            className="bubble-menu-portal"
            style={{
              position: "fixed",
              top: bubbleRect.top - 46,
              left: bubbleRect.left + bubbleRect.width / 2,
              transform: "translateX(-50%)",
              zIndex: 200,
            }}
          >
            <EditorToolbar editor={editor} />
          </div>,
          document.body
        )}

      <EditorContent editor={editor} className="editor-content" />

      <div className="editor-status-bar">
        <span>{wordCount} {wordCount === 1 ? "word" : "words"}</span>
        <span>·</span>
        <span>~{readingMins} min read</span>
        <span>·</span>
        {saveStatus === "saving" && <span className="saving">Saving…</span>}
        {saveStatus === "saved"  && <span className="saved">Saved</span>}
        {saveStatus === "idle"   && <span>Saved</span>}
      </div>
    </div>
  );
}
