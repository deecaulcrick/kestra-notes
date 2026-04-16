import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Pin, Trash2, MoreHorizontal } from "lucide-react";
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
import { createNote as createNoteCmd } from "../../lib/tauri";
import { SlashCommands, registerImageRequestHandler } from "./extensions/SlashCommands";
import { Callout } from "./extensions/Callout";
import { ImageUpload, insertFromPath } from "./extensions/ImageUpload";
import { Tag } from "./extensions/Tag";
import { EditorToolbar } from "./EditorToolbar";
import { useNote } from "../../hooks/useNote";
import { useNoteStore } from "../../store/noteStore";
import { useUIStore } from "../../store/uiStore";
import { useThemeStore } from "../../store/themeStore";
import "./EditorStyles.css";

const lowlight = createLowlight(common);

type MarkdownStorage = { getMarkdown(): string };

interface Props {
  noteId: string | null;
}

export function Editor({ noteId }: Props) {
  const scheduleSaveRef = useRef<((content: string) => void) | undefined>(undefined);
  const [bubbleRect, setBubbleRect] = useState<DOMRect | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { setActiveNote, workspace, notes, pinNote, deleteNote } = useNoteStore();
  const vaultPath = workspace?.vault_path ?? null;
  const setActiveTag = useUIStore((s) => s.setActiveTag);
  const typography = useThemeStore((s) => s.typography);

  const onNavigateRef = useRef<(id: string) => void>((id) => setActiveNote(id));
  const onCreateNoteRef = useRef<(title: string) => void>((title) => { void createNoteCmd(title); });
  const onTagClickRef = useRef<(tag: string) => void>((tag) => setActiveTag(tag));
  onNavigateRef.current = (id) => setActiveNote(id);
  onCreateNoteRef.current = (title) => {
    void createNoteCmd(title).then((note) => {
      // Navigate to the note (whether newly created or already existing).
      setActiveNote(note.id);
    });
  };
  onTagClickRef.current = (tag) => setActiveTag(tag);

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
      Tag.configure({
        onTagClick: (tag) => onTagClickRef.current(tag),
      }),
      SlashCommands,
      Callout,
    ],

    editorProps: {
      attributes: { class: "tiptap", spellcheck: "true" },
    },

    onUpdate: ({ editor }) => {
      const store = editor.storage as unknown as Record<string, unknown>;
      let md = (store["markdown"] as MarkdownStorage).getMarkdown();
      // tiptap-markdown escapes [ → \[ because brackets are markdown link syntax.
      // Undo this globally so [[wikilinks]] survive the round-trip to disk.
      // Actual link nodes are serialized separately by tiptap-markdown as
      // [text](url), not as plain text, so they are unaffected by this.
      // Only unescape [[wikilinks]] — not all brackets.
      // tiptap-markdown escapes literal [ as \[ but [[Note]] becomes \[\[Note\]\].
      md = md.replace(/\\\[\\\[([^\]]*)\\\]\\\]/g, "[[$1]]");
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
      if (rect.width === 0 && rect.height === 0) { setBubbleRect(null); return; }
      setBubbleRect(rect);
    },

    content: "",
  });

  const { saveStatus, scheduleSave } = useNote(noteId, editor);
  scheduleSaveRef.current = scheduleSave;

  // Apply typography settings as CSS variables on the editor container.
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

  // Register WikiLink dispatch.
  useEffect(() => {
    if (!editor) return;
    registerWikiLinkDispatch((resolved) => {
      if (editor.isDestroyed) return;
      const tr = editor.state.tr.setMeta(wikiLinkKey, resolved);
      editor.view.dispatch(tr);
    });
    return () => registerWikiLinkDispatch(() => {});
  }, [editor]);

  // Register /image slash command handler.
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

  // Close menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const activeNote = noteId ? (notes.find((n) => n.id === noteId) ?? null) : null;

  const handlePin = useCallback(async () => {
    if (!noteId || !activeNote) return;
    setMenuOpen(false);
    await pinNote(noteId, !activeNote.pinned);
  }, [noteId, activeNote, pinNote]);

  const handleDelete = useCallback(async () => {
    if (!noteId) return;
    setMenuOpen(false);
    if (window.confirm("Delete this note? This cannot be undone.")) {
      await deleteNote(noteId);
    }
  }, [noteId, deleteNote]);

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

      {/* Note actions menu */}
      <div className="editor-actions" ref={menuRef}>
        <button
          className="editor-actions-btn"
          title="More options"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <MoreHorizontal size={16} />
        </button>
        {menuOpen && (
          <div className="editor-actions-menu">
            <button className="editor-actions-item" onClick={handlePin}>
              <Pin size={14} />
              {activeNote?.pinned ? "Unpin note" : "Pin note"}
            </button>
            <button className="editor-actions-item editor-actions-item--danger" onClick={handleDelete}>
              <Trash2 size={14} />
              Delete note
            </button>
          </div>
        )}
      </div>

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
