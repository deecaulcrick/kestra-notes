import { useEffect, useMemo, useRef, useState } from "react";
import { useNoteStore } from "../../store/noteStore";
import { useUIStore } from "../../store/uiStore";
import { useSearch } from "../../hooks/useSearch";
import type { Note } from "../../lib/tauri";
import { SquarePen, Search, X, Pin } from 'lucide-react';
import "./NoteList.css";

const SECTION_LABELS: Record<string, string> = {
  notes: "Notes",
  untagged: "Untagged",
  todo: "Todo",
  today: "Today",
  pinned: "Pinned",
  trash: "Trash",
};

export function NoteList() {
  const notes = useNoteStore((s) => s.notes);
  const activeNoteId = useNoteStore((s) => s.activeNoteId);
  const setActiveNote = useNoteStore((s) => s.setActiveNote);
  const createNote = useNoteStore((s) => s.createNote);
  const loadNotesByTag = useNoteStore((s) => s.loadNotesByTag);
  const loadNotes = useNoteStore((s) => s.loadNotes);

  const activeSection = useUIStore((s) => s.activeSection);
  const activeTagName = useUIStore((s) => s.activeTagName);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { results: searchResults, isSearching } = useSearch(searchQuery);

  // When section or tag changes, refresh the note list and clear search.
  useEffect(() => {
    setSearchQuery("");
    setSearchVisible(false);
    if (activeTagName) {
      void loadNotesByTag(activeTagName);
    } else {
      void loadNotes();
    }
  }, [activeSection, activeTagName]);

  // Cmd+K opens the search bar.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        e.stopPropagation();
        setSearchVisible(true);
        // Defer focus so the input is rendered first.
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  // Focus the input when search becomes visible.
  useEffect(() => {
    if (searchVisible) searchInputRef.current?.focus();
  }, [searchVisible]);

  function closeSearch() {
    setSearchVisible(false);
    setSearchQuery("");
  }

  // Client-side section filtering (used when not searching).
  const sectionFiltered = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartSecs = todayStart.getTime() / 1000;

    if (activeTagName) return notes;

    switch (activeSection) {
      case "untagged": return notes.filter((n) => n.tags.length === 0);
      case "todo": return notes.filter((n) => n.has_todos);
      case "today": return notes.filter((n) => n.updated_at >= todayStartSecs);
      case "trash": return [];
      case "pinned": return notes.filter((n) => n.pinned);
      default: return notes;
    }
  }, [notes, activeSection, activeTagName]);

  const isSearchActive = searchQuery.trim().length > 0;
  const headingLabel = isSearchActive
    ? "Search results"
    : activeTagName ? `#${activeTagName}` : SECTION_LABELS[activeSection] ?? "Notes";

  return (
    <div className="note-list">
      {/* Header */}
      <div className="note-list-header">
        {searchVisible ? (
          <div className="note-list-search-row">
            <span className="nl-search-icon"> <Search size={16} /></span>
            <input
              ref={searchInputRef}
              className="note-list-search"
              placeholder="Search all notes…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") closeSearch(); }}
            />
            {isSearching && <span className="nl-search-spinner" />}
            <button className="nl-icon-btn" title="Close search (Esc)" onClick={closeSearch}> <X size={16} /> </button>
          </div>
        ) : (
          <>
            <span className="note-list-title">{headingLabel}</span>
            <div className="note-list-header-actions">
              <button className="nl-icon-btn" title="Search (⌘K)" onClick={() => setSearchVisible(true)}> <Search size={16} /> </button>
              <button className="nl-icon-btn" title="New note" onClick={() => createNote()}>
                <SquarePen size={16} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Cards */}
      <div className="note-list-cards">
        {isSearchActive ? (
          searchResults.length === 0 && !isSearching ? (
            <p className="note-list-empty">No results for "{searchQuery}"</p>
          ) : (
            searchResults.map((result) => (
              <SearchResultCard
                key={result.id}
                title={result.title}
                snippet={result.snippet}
                active={result.id === activeNoteId}
                onClick={() => setActiveNote(result.id)}
              />
            ))
          )
        ) : (
          sectionFiltered.length === 0 ? (
            <p className="note-list-empty">No notes.</p>
          ) : (
            sectionFiltered.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                active={note.id === activeNoteId}
                onClick={() => setActiveNote(note.id)}
              />
            ))
          )
        )}
      </div>
    </div>
  );
}

function NoteCard({
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
      className={`note-card${active ? " note-card--active" : ""}`}
      onClick={onClick}
    >
      <div className="note-card-title">
        <span className="note-card-title-text">{note.title}</span>
        {note.pinned && <Pin size={11} className="note-card-pin" />}
      </div>
      {note.preview && (
        <div className="note-card-preview">{note.preview}</div>
      )}
      <div className="note-card-meta">
        <span className="note-card-date">{formatRelative(note.updated_at)}</span>
        {note.tags.filter((t) => !t.includes("/")).slice(0, 2).map((tag) => (
          <span key={tag} className="note-card-tag">#{tag}</span>
        ))}
      </div>
    </button>
  );
}

function SearchResultCard({
  title,
  snippet,
  active,
  onClick,
}: {
  title: string;
  snippet: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`note-card${active ? " note-card--active" : ""}`}
      onClick={onClick}
    >
      <div className="note-card-title">{title}</div>
      {snippet && (
        <div
          className="note-card-preview note-card-snippet"
          // snippet has <b> tags from FTS5 — safe: content comes from user's own files
          dangerouslySetInnerHTML={{ __html: snippet }}
        />
      )}
    </button>
  );
}

function formatRelative(unixSecs: number): string {
  if (!unixSecs) return "";
  const diffMs = Date.now() - unixSecs * 1000;
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return "just now";
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(unixSecs * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
