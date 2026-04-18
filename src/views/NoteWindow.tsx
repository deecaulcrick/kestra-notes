import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Editor } from "../components/Editor/Editor";
import { BacklinksPanel } from "../components/BacklinksPanel/BacklinksPanel";
import { useNoteStore } from "../store/noteStore";
import { useThemeStore } from "../store/themeStore";
import {
  openNoteWindow, getNote, pinNote, deleteNote,
} from "../lib/tauri";
import { Link2, Pin, Trash2, MoreHorizontal } from "lucide-react";
import "./NoteWindow.css";

interface Props {
  noteId: string;
  tag: string;
}

// ── Portal dropdown — escapes the Tauri drag region ──────────────────────────

function PortalDropdown({
  anchorRef,
  onClose,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }
  }, []);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  if (!pos) return null;

  return createPortal(
    <div ref={dropRef} className="nw-portal-dropdown" style={{ top: pos.top, right: pos.right }}>
      {children}
    </div>,
    document.body
  );
}

// ── NoteWindow ────────────────────────────────────────────────────────────────

export function NoteWindow({ noteId, tag }: Props) {
  const [noteTitle, setNoteTitle]         = useState("");
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);
  const [isPinned, setIsPinned]           = useState(false);
  const [actionsOpen, setActionsOpen]     = useState(false);
  const actionsBtnRef = useRef<HTMLButtonElement>(null);

  const loadSettings = useThemeStore((s) => s.loadSettings);
  useEffect(() => { void loadSettings(); }, []);

  useEffect(() => {
    getNote(noteId)
      .then((note) => { setNoteTitle(note.title); document.title = note.title; })
      .catch(() => {});
  }, [noteId]);

  const handleNavigate = useCallback((id: string) => {
    void openNoteWindow(id, "");
  }, []);

  const handlePin = useCallback(async () => {
    setActionsOpen(false);
    const next = !isPinned;
    await pinNote(noteId, next);
    setIsPinned(next);
  }, [noteId, isPinned]);

  const handleDelete = useCallback(async () => {
    setActionsOpen(false);
    if (window.confirm("Delete this note? This cannot be undone.")) {
      await deleteNote(noteId);
      window.close();
    }
  }, [noteId]);

  return (
    <div className="note-window">
      {/* Title bar */}
      <div className="note-window-titlebar" data-tauri-drag-region>
        <div className="note-window-breadcrumb">
          <span className="nw-breadcrumb-root">Notes</span>
          {tag && (
            <>
              <span className="nw-breadcrumb-sep">/</span>
              <span className="nw-breadcrumb-category">#{tag}</span>
            </>
          )}
          {noteTitle && (
            <>
              <span className="nw-breadcrumb-sep">/</span>
              <span className="nw-breadcrumb-title">{noteTitle}</span>
            </>
          )}
        </div>

        <div className="note-window-actions" data-tauri-drag-region="false">
          <button
            className={`nw-action-btn${infoPanelOpen ? " nw-action-btn--active" : ""}`}
            title="Backlinks & info"
            onClick={() => setInfoPanelOpen((o) => !o)}
          >
            <Link2 size={14} />
          </button>

          <button
            ref={actionsBtnRef}
            className="nw-action-btn"
            title="Note actions"
            onClick={() => setActionsOpen((o) => !o)}
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>

      {/* Actions portal */}
      {actionsOpen && (
        <PortalDropdown
          anchorRef={actionsBtnRef}
          onClose={() => setActionsOpen(false)}
        >
          <div className="nw-actions-menu-inner">
            <button className="nw-actions-item" onMouseDown={(e) => { e.preventDefault(); void handlePin(); }}>
              <Pin size={13} />
              {isPinned ? "Unpin note" : "Pin note"}
            </button>
            <button className="nw-actions-item nw-actions-item--danger" onMouseDown={(e) => { e.preventDefault(); void handleDelete(); }}>
              <Trash2 size={13} />
              Delete note
            </button>
          </div>
        </PortalDropdown>
      )}

      {/* Editor */}
      <div className="note-window-body">
        <div className="note-window-editor">
          <Editor noteId={noteId} onNavigate={handleNavigate} />
        </div>

        {infoPanelOpen && (
          <div className="note-window-info-panel">
            <div className="nw-info-header">
              <span className="nw-info-title">Backlinks</span>
              <button className="nw-info-close" onClick={() => setInfoPanelOpen(false)}>✕</button>
            </div>
            <BacklinksPanel embedded />
          </div>
        )}
      </div>
    </div>
  );
}

// ── NoteWindowWithVault ───────────────────────────────────────────────────────

export function NoteWindowWithVault({ noteId, tag }: Props) {
  const openVault = useNoteStore((s) => s.openVault);
  const workspace = useNoteStore((s) => s.workspace);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (workspace) { setReady(true); return; }
    const lastPath = localStorage.getItem("lastVaultPath");
    if (lastPath) {
      openVault(lastPath).finally(() => setReady(true));
    } else {
      setReady(true);
    }
  }, []);

  if (!ready) return null;
  return <NoteWindow noteId={noteId} tag={tag} />;
}
