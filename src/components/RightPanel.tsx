import { useNoteStore } from "../store/noteStore";
import { useGraph } from "../hooks/useGraph";
import type { BacklinkNote, OutboundLink } from "../lib/tauri";
import "./RightPanel.css";

export function RightPanel() {
  const activeNoteId = useNoteStore((s) => s.activeNoteId);
  const setActiveNote = useNoteStore((s) => s.setActiveNote);
  const { backlinks, outbound, isLoading } = useGraph(activeNoteId);

  if (!activeNoteId) {
    return <div className="right-panel right-panel--empty" />;
  }

  return (
    <div className="right-panel">
      <section className="right-panel-section">
        <h3 className="right-panel-heading">
          Backlinks
          {backlinks.length > 0 && (
            <span className="right-panel-count">{backlinks.length}</span>
          )}
        </h3>

        {isLoading ? (
          <p className="right-panel-empty">Loading…</p>
        ) : backlinks.length === 0 ? (
          <p className="right-panel-empty">No backlinks yet.</p>
        ) : (
          <ul className="right-panel-list">
            {backlinks.map((note) => (
              <BacklinkRow
                key={note.id}
                note={note}
                onClick={() => setActiveNote(note.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {outbound.length > 0 && (
        <section className="right-panel-section">
          <h3 className="right-panel-heading">
            Outbound links
            <span className="right-panel-count">{outbound.length}</span>
          </h3>
          <ul className="right-panel-list">
            {outbound.map((link, i) => (
              <OutboundRow
                key={i}
                link={link}
                onClick={
                  link.resolved_id
                    ? () => setActiveNote(link.resolved_id!)
                    : undefined
                }
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function BacklinkRow({
  note,
  onClick,
}: {
  note: BacklinkNote;
  onClick: () => void;
}) {
  return (
    <li>
      <button className="right-panel-link" onClick={onClick} title={note.file_path}>
        <span className="right-panel-link-icon">←</span>
        {note.title}
      </button>
    </li>
  );
}

function OutboundRow({
  link,
  onClick,
}: {
  link: OutboundLink;
  onClick?: () => void;
}) {
  const label = link.resolved_title ?? link.link_text;
  const resolved = !!link.resolved_id;

  return (
    <li>
      <button
        className={`right-panel-link${resolved ? "" : " right-panel-link--ghost"}`}
        onClick={onClick}
        disabled={!resolved}
        title={resolved ? undefined : "Note not yet created"}
      >
        <span className="right-panel-link-icon">→</span>
        {label}
      </button>
    </li>
  );
}
