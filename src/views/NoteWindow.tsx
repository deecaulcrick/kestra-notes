import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Editor, type EditorStats } from "../components/Editor/Editor";
import { BacklinksPanel } from "../components/BacklinksPanel/BacklinksPanel";
import { useNoteStore } from "../store/noteStore";
import { useThemeStore } from "../store/themeStore";
import {
  openNoteWindow,
  getNote,
  pinNote,
  deleteNote,
} from "../lib/tauri";
import {
  ALargeSmall,
  Cable,
  Clock,
  EllipsisVertical,
  Info,
  MessageSquareText,
  Pin,
  Trash2,
} from "lucide-react";
import "./NoteWindow.css";

interface Props {
  noteId: string;
  tag: string;
}

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
    const rect = anchorRef.current.getBoundingClientRect();
    if (align === "right") {
      setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    } else if (align === "left") {
      setPos({ top: rect.bottom + 6, left: rect.left });
    } else {
      setPos({
        top: rect.bottom + 6,
        left: rect.left + rect.width / 2,
        transform: "translateX(-50%)",
      });
    }
  }, [align, anchorRef]);

  useEffect(() => {
    const id = setTimeout(() => {
      function onPointerDown(e: PointerEvent) {
        if (
          popRef.current &&
          !popRef.current.contains(e.target as Node) &&
          anchorRef.current &&
          !anchorRef.current.contains(e.target as Node)
        ) {
          onClose();
        }
      }
      document.addEventListener("pointerdown", onPointerDown);
      return () => document.removeEventListener("pointerdown", onPointerDown);
    }, 50);
    return () => clearTimeout(id);
  }, [anchorRef, onClose]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={popRef}
      className="nw-popover"
      style={{ position: "fixed", zIndex: 9999, ...pos }}
    >
      {children}
    </div>,
    document.body
  );
}

export function NoteWindow({ noteId, tag }: Props) {
  const notes = useNoteStore((s) => s.notes);
  const openVault = useNoteStore((s) => s.openVault);
  const workspace = useNoteStore((s) => s.workspace);
  const loadSettings = useThemeStore((s) => s.loadSettings);

  const [noteTitle, setNoteTitle] = useState("");
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [backlinksOpen, setBacklinksOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [stats, setStats] = useState<EditorStats>({
    wordCount: 0,
    readingMins: 1,
    saveStatus: "idle",
  });

  const infoBtnRef = useRef<HTMLButtonElement>(null);
  const toolbarBtnRef = useRef<HTMLButtonElement>(null);
  const backlinksBtnRef = useRef<HTMLButtonElement>(null);
  const actionsBtnRef = useRef<HTMLButtonElement>(null);

  const activeNote = notes.find((note) => note.id === noteId) ?? null;

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (workspace) return;
    const lastPath = localStorage.getItem("lastVaultPath");
    if (lastPath) {
      void openVault(lastPath);
    }
  }, [openVault, workspace]);

  useEffect(() => {
    getNote(noteId)
      .then((note) => {
        setNoteTitle(note.title);
        document.title = note.title;
      })
      .catch(() => {});
  }, [noteId]);

  useEffect(() => {
    setBacklinksOpen(false);
    setInfoOpen(false);
    setActionsOpen(false);
  }, [noteId]);

  useEffect(() => {
    setIsPinned(Boolean(activeNote?.pinned));
  }, [activeNote?.pinned]);

  const handleNavigate = useCallback((id: string) => {
    void openNoteWindow(id, "");
  }, []);

  const handlePin = useCallback(async () => {
    setActionsOpen(false);
    const nextPinned = !isPinned;
    await pinNote(noteId, nextPinned);
    setIsPinned(nextPinned);
  }, [isPinned, noteId]);

  const handleDelete = useCallback(async () => {
    setActionsOpen(false);
    if (window.confirm("Delete this note? This cannot be undone.")) {
      await deleteNote(noteId);
      window.close();
    }
  }, [noteId]);

  return (
    <div className="note-window">
      <div className="note-window-titlebar" data-tauri-drag-region>
        <div className="note-window-breadcrumb" data-tauri-drag-region>
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
          <span className={`nw-save-status nw-save-status--${stats.saveStatus}`}>
            {stats.saveStatus === "saving" ? "Saving…" : "Saved"}
          </span>

          <button
            ref={infoBtnRef}
            className={`nw-action-btn${infoOpen ? " active" : ""}`}
            title="Note info"
            onClick={() => {
              setInfoOpen((open) => !open);
              setBacklinksOpen(false);
              setActionsOpen(false);
            }}
          >
            <Info size={16} />
          </button>

          <button
            ref={toolbarBtnRef}
            className={`nw-action-btn${toolbarVisible ? " active" : ""}`}
            title="Formatting toolbar"
            onClick={() => setToolbarVisible((visible) => !visible)}
          >
            <ALargeSmall size={16} />
          </button>

          <button
            ref={backlinksBtnRef}
            className={`nw-action-btn${backlinksOpen ? " active" : ""}`}
            title="Backlinks"
            onClick={() => {
              setBacklinksOpen((open) => !open);
              setInfoOpen(false);
              setActionsOpen(false);
            }}
          >
            <Cable size={16} />
          </button>

          <button
            ref={actionsBtnRef}
            className="nw-action-btn"
            title="Note actions"
            onClick={() => {
              setActionsOpen((open) => !open);
              setInfoOpen(false);
              setBacklinksOpen(false);
            }}
          >
            <EllipsisVertical size={16} />
          </button>
        </div>
      </div>

      {infoOpen && (
        <Popover anchorRef={infoBtnRef} onClose={() => setInfoOpen(false)} align="right">
          <div className="nw-info-popover">
            <div className="nw-info-row">
              <div className="nw-info-value">
                {stats.wordCount} <span><MessageSquareText size={10} /></span>
              </div>
              <div className="nw-info-label">Words</div>
            </div>
            <div className="nw-info-row">
              <div className="nw-info-value">
                ~{stats.readingMins}m <span><Clock size={10} /></span>
              </div>
              <div className="nw-info-label">Reading time</div>
            </div>
          </div>
        </Popover>
      )}

      {backlinksOpen && (
        <Popover
          anchorRef={backlinksBtnRef}
          onClose={() => setBacklinksOpen(false)}
          align="right"
        >
          <div className="nw-backlinks-popover">
            <div className="nw-backlinks-popover-header">Backlinks</div>
            <div className="nw-backlinks-popover-body">
              <BacklinksPanel noteId={noteId} embedded />
            </div>
          </div>
        </Popover>
      )}

      {actionsOpen && (
        <Popover anchorRef={actionsBtnRef} onClose={() => setActionsOpen(false)} align="right">
          <div className="nw-actions-menu">
            <button
              className="nw-action-item"
              onMouseDown={(e) => {
                e.preventDefault();
                void handlePin();
              }}
            >
              <Pin size={13} />
              {isPinned ? "Unpin note" : "Pin note"}
            </button>
            <button
              className="nw-action-item nw-action-item--danger"
              onMouseDown={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              <Trash2 size={13} />
              Delete note
            </button>
          </div>
        </Popover>
      )}

      <div className="note-window-body">
        <div className="note-window-editor">
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

export function NoteWindowWithVault({ noteId, tag }: Props) {
  const openVault = useNoteStore((s) => s.openVault);
  const workspace = useNoteStore((s) => s.workspace);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (workspace) {
      setReady(true);
      return;
    }

    const lastPath = localStorage.getItem("lastVaultPath");
    if (lastPath) {
      openVault(lastPath).finally(() => setReady(true));
    } else {
      setReady(true);
    }
  }, [openVault, workspace]);

  if (!ready) return null;
  return <NoteWindow noteId={noteId} tag={tag} />;
}
