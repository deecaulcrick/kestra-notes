import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Editor, type EditorStats } from "./Editor";
import { BacklinksPanel } from "../BacklinksPanel/BacklinksPanel";
import { useNoteStore } from "../../store/noteStore";
import { useUIStore } from "../../store/uiStore";
import { getNote } from "../../lib/tauri";
import { Link2, Pin, Trash2, MoreHorizontal, AlignLeft, Info } from "lucide-react";
import "./EditorPane.css";

interface Props {
  noteId: string;
}

// ── Generic anchored popover ──────────────────────────────────────────────────

function Popover({
  anchorRef,
  onClose,
  align = "right",
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  align?: "right" | "left" | "center";
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    if (align === "right") {
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    } else if (align === "left") {
      setPos({ top: r.bottom + 6, left: r.left });
    } else {
      setPos({ top: r.bottom + 6, left: r.left + r.width / 2, transform: "translateX(-50%)" });
    }
  }, [align]);

  useEffect(() => {
    const id = setTimeout(() => {
      function onPointerDown(e: PointerEvent) {
        if (
          popRef.current && !popRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)
        ) onClose();
      }
      document.addEventListener("pointerdown", onPointerDown);
      return () => document.removeEventListener("pointerdown", onPointerDown);
    }, 50);
    return () => clearTimeout(id);
  }, [onClose]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!pos) return null;
  return createPortal(
    <div ref={popRef} className="ep-popover" style={{ position: "fixed", zIndex: 9999, ...pos }}>
      {children}
    </div>,
    document.body
  );
}

// ── EditorPane ────────────────────────────────────────────────────────────────

export function EditorPane({ noteId }: Props) {
  const notes           = useNoteStore((s) => s.notes);
  const pinNoteStore    = useNoteStore((s) => s.pinNote);
  const deleteNoteStore = useNoteStore((s) => s.deleteNote);
  const setActiveNoteId = useUIStore((s) => s.setActiveNoteId);

  const [noteTitle, setNoteTitle]         = useState("");
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [backlinksOpen, setBacklinksOpen] = useState(false);
  const [infoOpen, setInfoOpen]           = useState(false);
  const [actionsOpen, setActionsOpen]     = useState(false);
  const [stats, setStats]                 = useState<EditorStats>({ wordCount: 0, readingMins: 1, saveStatus: "idle" });

  const toolbarBtnRef  = useRef<HTMLButtonElement>(null);
  const backlinksBtnRef = useRef<HTMLButtonElement>(null);
  const infoBtnRef     = useRef<HTMLButtonElement>(null);
  const actionsBtnRef  = useRef<HTMLButtonElement>(null);

  const activeNote = notes.find((n) => n.id === noteId) ?? null;

  useEffect(() => {
    getNote(noteId).then((note) => setNoteTitle(note.title)).catch(() => {});
  }, [noteId]);

  useEffect(() => { setBacklinksOpen(false); }, [noteId]);

  const handleNavigate = useCallback((id: string) => {
    setActiveNoteId(id);
  }, [setActiveNoteId]);

  const handlePin = useCallback(async () => {
    setActionsOpen(false);
    await pinNoteStore(noteId, !activeNote?.pinned);
  }, [noteId, activeNote, pinNoteStore]);

  const handleDelete = useCallback(async () => {
    setActionsOpen(false);
    if (window.confirm("Delete this note? This cannot be undone.")) {
      await deleteNoteStore(noteId);
      setActiveNoteId(null);
    }
  }, [noteId, deleteNoteStore, setActiveNoteId]);

  return (
    <div className="ep-shell">
      {/* Titlebar */}
      <div className="ep-titlebar" data-tauri-drag-region>
        <div className="ep-breadcrumb" data-tauri-drag-region>
          <span className="ep-breadcrumb-root">Notes</span>
          {noteTitle && (
            <>
              <span className="ep-breadcrumb-sep">/</span>
              <span className="ep-breadcrumb-title">{noteTitle}</span>
            </>
          )}
        </div>

        <div className="ep-actions">
          {/* Save status pill */}
          <span className={`ep-save-status ep-save-status--${stats.saveStatus}`}>
            {stats.saveStatus === "saving" ? "Saving…" : "Saved"}
          </span>

          {/* Info */}
          <button
            ref={infoBtnRef}
            className={`ep-action-btn${infoOpen ? " active" : ""}`}
            title="Note info"
            onClick={() => { setInfoOpen((o) => !o); setBacklinksOpen(false); setActionsOpen(false); }}
          >
            <Info size={14} />
          </button>

          {/* Toolbar toggle */}
          <button
            ref={toolbarBtnRef}
            className={`ep-action-btn${toolbarVisible ? " active" : ""}`}
            title="Formatting toolbar"
            onClick={() => setToolbarVisible((v) => !v)}
          >
            <AlignLeft size={14} />
          </button>

          {/* Backlinks */}
          <button
            ref={backlinksBtnRef}
            className={`ep-action-btn${backlinksOpen ? " active" : ""}`}
            title="Backlinks"
            onClick={() => { setBacklinksOpen((o) => !o); setInfoOpen(false); setActionsOpen(false); }}
          >
            <Link2 size={14} />
          </button>

          {/* Actions */}
          <button
            ref={actionsBtnRef}
            className="ep-action-btn"
            title="Note actions"
            onClick={() => { setActionsOpen((o) => !o); setInfoOpen(false); setBacklinksOpen(false); }}
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>

      {/* Info popover */}
      {infoOpen && (
        <Popover anchorRef={infoBtnRef} onClose={() => setInfoOpen(false)} align="right">
          <div className="ep-info-popover">
            <div className="ep-info-row">
              <span className="ep-info-label">Words</span>
              <span className="ep-info-value">{stats.wordCount}</span>
            </div>
            <div className="ep-info-row">
              <span className="ep-info-label">Reading time</span>
              <span className="ep-info-value">~{stats.readingMins} min</span>
            </div>
          </div>
        </Popover>
      )}

      {/* Backlinks popover */}
      {backlinksOpen && (
        <Popover anchorRef={backlinksBtnRef} onClose={() => setBacklinksOpen(false)} align="right">
          <div className="ep-backlinks-popover">
            <div className="ep-backlinks-popover-header">Backlinks</div>
            <div className="ep-backlinks-popover-body">
              <BacklinksPanel noteId={noteId} embedded />
            </div>
          </div>
        </Popover>
      )}

      {/* Actions dropdown */}
      {actionsOpen && (
        <Popover anchorRef={actionsBtnRef} onClose={() => setActionsOpen(false)} align="right">
          <div className="ep-actions-menu">
            <button className="ep-action-item" onMouseDown={(e) => { e.preventDefault(); void handlePin(); }}>
              <Pin size={13} />
              {activeNote?.pinned ? "Unpin note" : "Pin note"}
            </button>
            <button className="ep-action-item ep-action-item--danger" onMouseDown={(e) => { e.preventDefault(); void handleDelete(); }}>
              <Trash2 size={13} />
              Delete note
            </button>
          </div>
        </Popover>
      )}

      {/* Editor */}
      <div className="ep-body">
        <div className="ep-editor">
          <Editor
            noteId={noteId}
            onNavigate={handleNavigate}
            toolbarVisible={toolbarVisible}
            onStatsChange={setStats}
          />
        </div>
      </div>
    </div>
  );
}
