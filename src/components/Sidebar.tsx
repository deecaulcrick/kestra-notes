import { useNoteStore } from "../store/noteStore";
import type { Note } from "../lib/tauri";
import "./Sidebar.css";

export function Sidebar() {
  const notes = useNoteStore((s) => s.notes);
  const activeNoteId = useNoteStore((s) => s.activeNoteId);
  const setActiveNote = useNoteStore((s) => s.setActiveNote);
  const createNote = useNoteStore((s) => s.createNote);
  const workspace = useNoteStore((s) => s.workspace);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-vault-name">{workspace?.name ?? "Vault"}</span>
        <div className="sidebar-header-actions">
          <button
            className="sidebar-new-btn"
            title="New note"
            aria-label="New note"
            onClick={() => createNote()}
          >
            +
          </button>
        </div>
      </div>

      <button
        className="sidebar-search-hint"
        title="Search notes (⌘K)"
        aria-label="Search notes"
        onClick={() => {
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
          );
        }}
      >
        <span className="sidebar-search-hint-text">Search…</span>
        <kbd className="sidebar-search-hint-kbd">⌘K</kbd>
      </button>

      <div className="sidebar-note-list">
        {notes.length === 0 ? (
          <p className="sidebar-empty">No notes yet.</p>
        ) : (
          notes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              active={note.id === activeNoteId}
              onClick={() => setActiveNote(note.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function NoteRow({
  note,
  active,
  onClick,
}: {
  note: Note;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`note-row${active ? " note-row--active" : ""}`}
      onClick={onClick}
    >
      <span className="note-row-title">{note.title}</span>
      <span className="note-row-date">{formatDate(note.updated_at)}</span>
    </button>
  );
}

function formatDate(unixSeconds: number): string {
  if (!unixSeconds) return "";
  const date = new Date(unixSeconds * 1000);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
