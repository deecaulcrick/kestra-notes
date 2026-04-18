import { useEffect, useMemo, useRef, useState } from "react";
import { useNoteStore } from "../../store/noteStore";
import { useUIStore } from "../../store/uiStore";
import { useSearch } from "../../hooks/useSearch";
import { SquarePen, Search, X, Pin } from "lucide-react";
import "./NoteList.css";

const SECTION_LABELS: Record<string, string> = {
  notes: "Notes",
  untagged: "Untagged",
  todo: "To-dos",
  today: "Today",
  pinned: "Pinned",
  trash: "Trash",
};

// ── Main NoteList ─────────────────────────────────────────────────────────────

export function NoteList() {
  const notes              = useNoteStore((s) => s.notes);
  const createNoteInStore  = useNoteStore((s) => s.createNote);
  const loadNotesByTag     = useNoteStore((s) => s.loadNotesByTag);
  const loadNotes          = useNoteStore((s) => s.loadNotes);

  const activeSection   = useUIStore((s) => s.activeSection);
  const activeTagName   = useUIStore((s) => s.activeTagName);
  const activeNoteId    = useUIStore((s) => s.activeNoteId);
  const setActiveNoteId = useUIStore((s) => s.setActiveNoteId);

  const [searchQuery, setSearchQuery]     = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { results: searchResults, isSearching } = useSearch(searchQuery);

  useEffect(() => {
    setSearchQuery("");
    setSearchVisible(false);
    if (activeTagName) void loadNotesByTag(activeTagName);
    else void loadNotes();
  }, [activeSection, activeTagName]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        e.stopPropagation();
        setSearchVisible(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  useEffect(() => {
    if (searchVisible) searchInputRef.current?.focus();
  }, [searchVisible]);

  function closeSearch() {
    setSearchVisible(false);
    setSearchQuery("");
  }

  const sectionFiltered = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartSecs = todayStart.getTime() / 1000;

    if (activeTagName) return notes;
    switch (activeSection) {
      case "untagged": return notes.filter((n) => n.tags.length === 0);
      case "todo":     return notes.filter((n) => n.has_todos);
      case "today":    return notes.filter((n) => n.updated_at >= todayStartSecs);
      case "pinned":   return notes.filter((n) => n.pinned);
      case "trash":    return [];
      default:         return notes;
    }
  }, [notes, activeSection, activeTagName]);

  const isSearchActive = searchQuery.trim().length > 0;
  const headingLabel   = isSearchActive
    ? "Search"
    : activeTagName
      ? `#${activeTagName.split("/").pop()!}`
      : SECTION_LABELS[activeSection] ?? "Notes";

  const displayedNotes = isSearchActive ? [] : sectionFiltered;

  return (
    <div className="note-list">
      {/* Header */}
      <div className="note-list-header" data-tauri-drag-region>
        {searchVisible ? (
          <div className="note-list-search-row">
            <Search size={13} className="nl-search-icon" />
            <input
              ref={searchInputRef}
              className="note-list-search"
              placeholder="Search…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") closeSearch(); }}
            />
            {isSearching && <span className="nl-search-spinner" />}
            <button className="nl-icon-btn" onClick={closeSearch} title="Close">
              <X size={13} />
            </button>
          </div>
        ) : (
          <div className="note-list-drag" >
            <div className="note-list-title-row " data-tauri-drag-region>
              <span className="note-list-title">{headingLabel}</span>
            </div>
            <div className="note-list-header-actions">
              <button className="nl-icon-btn" title="Search (⌘K)" onClick={() => setSearchVisible(true)}>
                <Search size={16} />
              </button>
              <button className="nl-icon-btn" title="New note" onClick={async () => {
                const id = await createNoteInStore();
                if (id) setActiveNoteId(id);
              }}>
                <SquarePen size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* List */}
      <div className="note-list-content note-list-rows">
        {isSearchActive ? (
          searchResults.length === 0 && !isSearching ? (
            <p className="note-list-empty">No results for "{searchQuery}"</p>
          ) : (
            searchResults.map((result) => (
              <NoteRow
                key={result.id}
                title={result.title}
                preview={result.snippet}
                date={0}
                tags={[]}
                pinned={false}
                active={activeNoteId === result.id}
                onClick={() => setActiveNoteId(result.id)}
                isSearchResult
              />
            ))
          )
        ) : displayedNotes.length === 0 ? (
          <p className="note-list-empty">No notes here.</p>
        ) : (
          displayedNotes.map((note) => (
            <NoteRow
              key={note.id}
              title={note.title}
              preview={note.preview}
              date={note.updated_at}
              tags={note.tags}
              pinned={note.pinned}
              active={activeNoteId === note.id}
              onClick={() => setActiveNoteId(note.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── NoteRow ───────────────────────────────────────────────────────────────────

function NoteRow({
  title, preview, date, tags, pinned, active, onClick, isSearchResult,
}: {
  title: string;
  preview: string;
  date: number;
  tags: string[];
  pinned: boolean;
  active: boolean;
  onClick: () => void;
  isSearchResult?: boolean;
}) {
  return (
    <button
      className={`note-row${active ? " note-row--active" : ""}`}
      onClick={onClick}
    >
      <div className="note-row-accent" />

      <div className="note-row-body">
        <div className="note-row-title">{title || "Untitled"}</div>
        {preview && (
          <div
            className="note-row-preview"
            dangerouslySetInnerHTML={isSearchResult ? { __html: preview } : undefined}
          >
            {isSearchResult ? undefined : preview}
          </div>
        )}
        <div className="note-row-meta">
          <div className="note-row-tag-block"> 
          {tags.slice(0, 2).map((t) => (
            <span key={t} className="note-row-tag">#{t}</span>
          ))}
          </div>
          <div className="note-row-pin-block">
          {pinned && <span className="note-row-pin"><Pin size={14}/></span>}
          {date > 0 && <span className="note-row-date">{formatRelative(date)}</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelative(unixSecs: number): string {
  if (!unixSecs) return "";
  const diffMs   = Date.now() - unixSecs * 1000;
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return "just now";
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7)  return `${diffDays}d ago`;
  return new Date(unixSecs * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
