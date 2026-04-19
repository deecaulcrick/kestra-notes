import { useEffect, useState } from "react";
import { useNoteStore } from "../../store/noteStore";
import { useUIStore, type SidebarSection } from "../../store/uiStore";
import { useCategoryStore } from "../../store/categoryStore";
import type { Tag } from "../../lib/tauri";
import { Settings, NotebookText, SquareCheck, CalendarFold, Pin, Inbox, Hash, LucideIcon } from "lucide-react";
import "./Sidebar.css";

interface Props {
  onSettings: () => void;
}

const SYSTEM_SECTIONS: { id: SidebarSection; label: string; icon: LucideIcon }[] = [
  { id: "notes", label: "Notes", icon: NotebookText },
  { id: "todo", label: "To-dos", icon: SquareCheck },
  { id: "today", label: "Today", icon: CalendarFold },
  { id: "pinned", label: "Pinned", icon: Pin },
  { id: "untagged", label: "Untagged", icon: Inbox },
  // { id: "trash", label: "Trash", icon: Trash },
];

export function Sidebar({ onSettings }: Props) {
  const workspace = useNoteStore((s) => s.workspace);

  const activeSection = useUIStore((s) => s.activeSection);
  const activeTagName = useUIStore((s) => s.activeTagName);
  const setSection = useUIStore((s) => s.setSection);
  const setActiveTag = useUIStore((s) => s.setActiveTag);

  const categories = useCategoryStore((s) => s.categories);
  const loadCategories = useCategoryStore((s) => s.loadCategories);

  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());

  // Load tags whenever the vault opens.
  useEffect(() => { void loadCategories(); }, [workspace]);

  const rootTags = categories.filter((t) => t.parent_name === null);

  function childrenOf(name: string) {
    return categories.filter((t) => t.parent_name === name);
  }

  function toggleTagExpand(name: string) {
    setExpandedTags((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  return (
    <div className="sidebar-wrapper">
      <aside className="sidebar">
        {/* Space for native traffic lights repositioned by mac-rounded-corners plugin */}
        <div className="sidebar-traffic-lights" data-tauri-drag-region />

        {/* System sections */}
        <nav className="sidebar-system-list">
          {SYSTEM_SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`sidebar-system-item${activeSection === s.id && !activeTagName ? " active" : ""}`}
              onClick={() => setSection(s.id)}
            >
              <s.icon size={16} />
              <div>
                {s.label}
              </div>

            </button>
          ))}
        </nav>

        {/* Tags */}
        {rootTags.length > 0 && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-section-header">Tags</div>
            <div className="sidebar-tag-list">
              {rootTags.map((tag) => (
                <TagRow
                  key={tag.name}
                  tag={tag}
                  depth={0}
                  active={activeTagName === tag.name}
                  expanded={expandedTags.has(tag.name)}
                  children={childrenOf(tag.name)}
                  allTags={categories}
                  activeTagName={activeTagName}
                  onSelect={setActiveTag}
                  onToggle={toggleTagExpand}
                />
              ))}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="sidebar-footer">
          <button className="sidebar-footer-btn sidebar-footer-icon" onClick={onSettings} title="Settings">
            <div>Settings</div>
            <Settings size={16} />
          </button>
        </div>
      </aside>
    </div>
  );
}

// ── TagRow ────────────────────────────────────────────────────────────────────

function TagRow({
  tag, depth, active, expanded, children, allTags, activeTagName,
  onSelect, onToggle,
}: {
  tag: Tag;
  depth: number;
  active: boolean;
  expanded: boolean;
  children: Tag[];
  allTags: Tag[];
  activeTagName: string | null;
  onSelect: (name: string | null) => void;
  onToggle: (name: string) => void;
}) {
  const hasChildren = children.length > 0;
  const label = tag.name.split("/").pop()!;

  return (
    <>
      <button
        className={`sidebar-tag-item${active ? " active" : ""}`}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        onClick={() => onSelect(tag.name)}
      >
        {hasChildren && (
          <span
            className={`sidebar-tag-chevron${expanded ? " expanded" : ""}`}
            onClick={(e) => { e.stopPropagation(); onToggle(tag.name); }}
          >
            ›
          </span>
        )}
        {!hasChildren && <span className="sidebar-tag-spacer" />}
        <span className="sidebar-tag-label">
          <span> <Hash size={12} /></span>{label}</span>
        {tag.note_count > 0 && (
          <span className="sidebar-tag-count">{tag.note_count}</span>
        )}
      </button>

      {hasChildren && expanded &&
        children.map((child) => (
          <TagRow
            key={child.name}
            tag={child}
            depth={depth + 1}
            active={activeTagName === child.name}
            expanded={false}
            children={allTags.filter((t) => t.parent_name === child.name)}
            allTags={allTags}
            activeTagName={activeTagName}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        ))
      }
    </>
  );
}
