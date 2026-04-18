import { useNoteStore } from "../../store/noteStore";
import { useUIStore } from "../../store/uiStore";
import { useGraph } from "../../hooks/useGraph";
import { openNoteWindow } from "../../lib/tauri";
import type { BacklinkNote } from "../../lib/tauri";
import "./BacklinksPanel.css";

interface Props {
  /** When embedded in a NoteWindow, pass the noteId directly instead of reading from store. */
  noteId?: string;
  /** Embedded mode: no collapse toggle, no border, rendered inline. */
  embedded?: boolean;
}

export function BacklinksPanel({ noteId: propNoteId, embedded = false }: Props) {
  const storeNoteId = useNoteStore((s) => s.activeNoteId);
  const setActiveNote = useNoteStore((s) => s.setActiveNote);
  const collapsed = useUIStore((s) => s.backlinksCollapsed);
  const toggle = useUIStore((s) => s.toggleBacklinks);

  const activeNoteId = propNoteId ?? storeNoteId;
  const { backlinks, isLoading } = useGraph(activeNoteId);
  const count = backlinks.length;

  function handleBacklinkClick(note: BacklinkNote) {
    if (propNoteId) {
      // In note window context — open a new window.
      void openNoteWindow(note.id, "");
    } else {
      setActiveNote(note.id);
    }
  }

  if (embedded) {
    return (
      <div className="backlinks-embedded">
        {isLoading ? (
          <p className="backlinks-empty">Loading…</p>
        ) : count === 0 ? (
          <p className="backlinks-empty">No notes link here yet.</p>
        ) : (
          backlinks.map((note) => (
            <BacklinkCard key={note.id} note={note} onClick={() => handleBacklinkClick(note)} />
          ))
        )}
      </div>
    );
  }

  return (
    <div className={`backlinks-panel${collapsed ? " collapsed" : ""}`}>
      <button className="backlinks-toggle" onClick={toggle} title="Toggle backlinks (⌘⇧B)">
        <div className="backlinks-toggle-line" />
        <span className="backlinks-toggle-label">
          {count > 0 ? `${count} backlink${count !== 1 ? "s" : ""}` : "No backlinks"}
        </span>
        <span className={`backlinks-toggle-chevron${collapsed ? "" : " open"}`}>›</span>
        <div className="backlinks-toggle-line" />
      </button>

      {!collapsed && (
        <div className="backlinks-list">
          {isLoading ? (
            <p className="backlinks-empty">Loading…</p>
          ) : count === 0 ? (
            <p className="backlinks-empty">No notes link here yet.</p>
          ) : (
            backlinks.map((note) => (
              <BacklinkCard key={note.id} note={note} onClick={() => handleBacklinkClick(note)} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function BacklinkCard({ note, onClick }: { note: BacklinkNote; onClick: () => void }) {
  return (
    <button className="backlink-card" onClick={onClick}>
      <span className="backlink-card-title">{note.title}</span>
    </button>
  );
}
