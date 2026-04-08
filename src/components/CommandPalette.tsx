import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNoteStore } from "../store/noteStore";
import { useSearch } from "../hooks/useSearch";
import "./CommandPalette.css";

interface Props {
  onClose: () => void;
}

export function CommandPalette({ onClose }: Props) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const setActiveNote = useNoteStore((s) => s.setActiveNote);
  const notes = useNoteStore((s) => s.notes);
  const { results: searchResults, isSearching } = useSearch(query);

  // Focus input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset selection when results change.
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // When query is empty, show all notes as quick-switch list.
  const displayResults: Array<{ id: string; title: string; snippet?: string }> =
    query.trim()
      ? searchResults
      : notes.slice(0, 30).map((n) => ({ id: n.id, title: n.title }));

  function navigate(id: string) {
    setActiveNote(id);
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, displayResults.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (displayResults[selectedIndex]) {
          navigate(displayResults[selectedIndex].id);
        }
        break;
      case "Escape":
        onClose();
        break;
    }
  }

  // Scroll selected item into view.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return createPortal(
    <div className="cp-backdrop" onClick={onClose}>
      <div
        className="cp-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Quick open"
      >
        <div className="cp-search-row">
          <span className="cp-search-icon">⌕</span>
          <input
            ref={inputRef}
            className="cp-input"
            placeholder="Search notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          {isSearching && <span className="cp-spinner" />}
        </div>

        {displayResults.length > 0 ? (
          <ul ref={listRef} className="cp-results" role="listbox">
            {displayResults.map((item, i) => (
              <ResultRow
                key={item.id}
                item={item}
                selected={i === selectedIndex}
                onSelect={() => navigate(item.id)}
                onHover={() => setSelectedIndex(i)}
              />
            ))}
          </ul>
        ) : (
          !isSearching && query.trim() && (
            <p className="cp-empty">No results for &ldquo;{query}&rdquo;</p>
          )
        )}
      </div>
    </div>,
    document.body
  );
}

function ResultRow({
  item,
  selected,
  onSelect,
  onHover,
}: {
  item: { id: string; title: string; snippet?: string };
  selected: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <li
      className={`cp-result${selected ? " cp-result--selected" : ""}`}
      role="option"
      aria-selected={selected}
      onMouseMove={onHover}
      onMouseDown={(e) => {
        // Use mousedown not click so we don't lose focus before navigating.
        e.preventDefault();
        onSelect();
      }}
    >
      <span className="cp-result-title">{item.title}</span>
      {item.snippet && (
        <span
          className="cp-result-snippet"
          // snippet already has <b> tags from FTS5 — safe to inject since
          // the content comes from the user's own vault files, not network.
          dangerouslySetInnerHTML={{ __html: item.snippet }}
        />
      )}
    </li>
  );
}

// ── Hook: open/close with Cmd+K ───────────────────────────────────────────────

export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
  };
}
