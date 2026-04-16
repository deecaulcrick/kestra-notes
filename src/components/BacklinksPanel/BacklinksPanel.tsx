import { useNoteStore } from "../../store/noteStore";
import { useUIStore } from "../../store/uiStore";
import { useGraph } from "../../hooks/useGraph";
import type { BacklinkNote } from "../../lib/tauri";
import "./BacklinksPanel.css";

export function BacklinksPanel() {
  const activeNoteId = useNoteStore((s) => s.activeNoteId);
  const setActiveNote = useNoteStore((s) => s.setActiveNote);
  const collapsed = useUIStore((s) => s.backlinksCollapsed);
  const toggle = useUIStore((s) => s.toggleBacklinks);

  const { backlinks, isLoading } = useGraph(activeNoteId);
  const count = backlinks.length;
  console.log("[BacklinksPanel] activeNoteId=", activeNoteId, "backlinks=", backlinks, "collapsed=", collapsed);

  return (
    <div className={`backlinks-panel${collapsed ? " collapsed" : ""}`}>
      {/* Divider / toggle bar */}
      <button className="backlinks-toggle" onClick={toggle} title="Toggle backlinks (⌘⇧B)">
        <div className="backlinks-toggle-line" />
        <span className="backlinks-toggle-label">
          {count > 0 ? `${count} backlink${count !== 1 ? "s" : ""}` : "No backlinks"}
        </span>
        <span className={`backlinks-toggle-chevron${collapsed ? "" : " open"}`}>›</span>
        <div className="backlinks-toggle-line" />
      </button>

      {/* Expanded content */}
      {!collapsed && (
        <div className="backlinks-list">
          {isLoading ? (
            <p className="backlinks-empty">Loading…</p>
          ) : count === 0 ? (
            <p className="backlinks-empty">No notes link here yet.</p>
          ) : (
            backlinks.map((note) => (
              <BacklinkCard
                key={note.id}
                note={note}
                onClick={() => setActiveNote(note.id)}
              />
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
