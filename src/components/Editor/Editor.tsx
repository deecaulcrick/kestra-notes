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
import { open } from "@tauri-apps/plugin-dialog";

import { WikiLink, registerWikiLinkDispatch, wikiLinkKey } from "./extensions/WikiLink";
import { Tag } from "./extensions/Tag";
import { createNote as createNoteCmd } from "../../lib/tauri";
import { SlashCommands, registerImageRequestHandler } from "./extensions/SlashCommands";
import { Callout } from "./extensions/Callout";
import { ImageUpload, insertFromPath } from "./extensions/ImageUpload";
import { EditorToolbar } from "./EditorToolbar";
import { useNote } from "../../hooks/useNote";
import { useNoteStore } from "../../store/noteStore";
import { useThemeStore } from "../../store/themeStore";
import "./EditorStyles.css";

const lowlight = createLowlight(common);

type MarkdownStorage = { getMarkdown(): string };

export interface EditorStats {
  wordCount: number;
  readingMins: number;
  saveStatus: "idle" | "saving" | "saved";
}

interface Props {
  noteId: string | null;
  onNavigate?: (id: string) => void;
  /** Controlled from EditorPane titlebar */
  toolbarVisible?: boolean;
  /** Called whenever word count / save status changes */
  onStatsChange?: (stats: EditorStats) => void;
}

export function Editor({ noteId, onNavigate, toolbarVisible = false, onStatsChange }: Props) {
  const scheduleSaveRef = useRef<((content: string) => void) | undefined>(undefined);
  const [bubbleRect, setBubbleRect] = useState<DOMRect | null>(null);

  const { setActiveNote } = useNoteStore();
  const vaultPath  = useNoteStore((s) => s.workspace?.vault_path ?? null);
  const typography = useThemeStore((s) => s.typography);

  const onNavigateRef   = useRef<(id: string) => void>((id) => setActiveNote(id));
  const onCreateNoteRef = useRef<(title: string) => void>((title) => { void createNoteCmd(title); });
  onNavigateRef.current  = (id) => { if (onNavigate) onNavigate(id); else setActiveNote(id); };
  onCreateNoteRef.current = (title) => {
    void createNoteCmd(title).then((note) => {
      if (onNavigate) onNavigate(note.id);
      else setActiveNote(note.id);
    });
  };

  const noteIdRef = useRef<string | null>(noteId);
  noteIdRef.current = noteId;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
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
        html: true,
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
      Tag,
    ],

    editorProps: {
      attributes: { class: "tiptap", spellcheck: "true" },
    },

    onUpdate: ({ editor }) => {
      const store = editor.storage as unknown as Record<string, unknown>;
      let md = (store["markdown"] as MarkdownStorage).getMarkdown();
      md = md.replace(/\\\[\\\[([^\]]*)\\\]\\\]/g, "[[$1]]");
      scheduleSaveRef.current?.(md);
    },

    onSelectionUpdate: ({ editor }) => {
      if (editor.state.selection.empty || editor.isActive("codeBlock")) {
        setBubbleRect(null); return;
      }
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) { setBubbleRect(null); return; }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) { setBubbleRect(null); return; }
      setBubbleRect(rect);
    },

    content: "",
  });

  const { saveStatus, scheduleSave } = useNote(noteId, editor);
  scheduleSaveRef.current = scheduleSave;

  // Report stats up to EditorPane
  const editorStore = editor?.storage as unknown as Record<string, unknown> | undefined;
  const wordCount   = (editorStore?.["characterCount"] as { words(): number } | undefined)?.words() ?? 0;
  const readingMins = Math.max(1, Math.ceil(wordCount / 200));

  useEffect(() => {
    onStatsChange?.({ wordCount, readingMins, saveStatus });
  }, [wordCount, saveStatus]);

  // Typography CSS variables
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".editor-content");
    if (!el) return;
    el.style.setProperty("--editor-font-family", `'${typography.textFont}', Georgia, serif`);
    el.style.setProperty("--editor-headings-font", `'${typography.headingsFont}', serif`);
    el.style.setProperty("--editor-code-font", `'${typography.codeFont}', monospace`);
    el.style.setProperty("--editor-font-size", `${typography.fontSize}px`);
    el.style.setProperty("--editor-line-height", `${typography.lineHeight}`);
    el.style.setProperty("--editor-max-width", `${typography.lineWidth}em`);
    el.style.setProperty("--editor-paragraph-spacing", `${typography.paragraphSpacing}em`);
    el.style.setProperty("--editor-paragraph-indent", `${typography.paragraphIndent}em`);
  }, [typography]);

  // WikiLink dispatch
  useEffect(() => {
    if (!editor) return;
    registerWikiLinkDispatch((resolved) => {
      if (editor.isDestroyed) return;
      const tr = editor.state.tr.setMeta(wikiLinkKey, resolved);
      editor.view.dispatch(tr);
    });
    return () => registerWikiLinkDispatch(() => {});
  }, [editor]);

  // Image slash command
  useEffect(() => {
    registerImageRequestHandler(async () => {
      if (!editor || editor.isDestroyed) return;
      const selected = await open({
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }],
        multiple: false,
      });
      if (!selected || typeof selected !== "string") return;
      await insertFromPath(selected, editor, {
        vaultPath,
        getNoteId: () => noteIdRef.current,
        HTMLAttributes: {},
        allowBase64: false,
      });
    });
  }, [editor, vaultPath]);

  useEffect(() => () => { editor?.destroy(); }, [editor]);

  if (!noteId) {
    return <div className="editor-empty-state">Select a note or press + to create one.</div>;
  }

  return (
    <div className="editor-wrapper">
      {/* Bubble menu on text selection */}
      {editor && bubbleRect && createPortal(
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

      {/* Persistent bottom-center floating toolbar (toggled from titlebar) */}
      {editor && toolbarVisible && (
        <div className="editor-persistent-toolbar">
          <EditorToolbar editor={editor} />
        </div>
      )}

      <EditorContent editor={editor} className="editor-content" />
    </div>
  );
}
