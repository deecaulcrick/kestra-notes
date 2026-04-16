import { useEffect, useState } from "react";
import { useNoteStore } from "../../store/noteStore";
import { useUIStore, type SidebarSection } from "../../store/uiStore";
import { getTags, type Tag } from "../../lib/tauri";
import { SlidersHorizontal, Inbox, SquareCheck, Calendar1, Pin, Trash2, ScrollText, type LucideIcon } from "lucide-react";
import "./Sidebar.css";

interface Props {
  onSettings: () => void;
}

const SYSTEM_SECTIONS: { id: SidebarSection; label: string; icon: LucideIcon }[] = [
  { id: "notes", label: "Notes", icon: ScrollText },
  { id: "untagged", label: "Untagged", icon: Inbox },
  { id: "todo", label: "Todo", icon: SquareCheck },
  { id: "today", label: "Today", icon: Calendar1 },
  { id: "pinned", label: "Pinned", icon: Pin },
  { id: "trash", label: "Trash", icon: Trash2 },
];

export function Sidebar({ onSettings }: Props) {
  const workspace = useNoteStore((s) => s.workspace);

  const activeSection = useUIStore((s) => s.activeSection);
  const activeTagName = useUIStore((s) => s.activeTagName);
  const setSection = useUIStore((s) => s.setSection);
  const setActiveTag = useUIStore((s) => s.setActiveTag);

  const [tags, setTags] = useState<Tag[]>([]);
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());

  // Load tags on mount and after notes change.
  useEffect(() => {
    getTags().then(setTags).catch(() => { });
  }, []);

  // Root tags — no parent.
  const rootTags = tags.filter((t) => t.parent_name === null);

  function childrenOf(name: string) {
    return tags.filter((t) => t.parent_name === name);
  }

  function toggleTagExpand(name: string) {
    setExpandedTags((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <aside className="sidebar">
      {/* Vault name */}
      <div className="sidebar-vault-header">
        <span className="sidebar-vault-name">{workspace?.name ?? "Vault"}</span>
        <button className="sidebar-icon-btn sidebar-settings-btn" title="Settings" onClick={onSettings}>
          <SlidersHorizontal size={16} />
        </button>

      </div>

      {/* System sections */}
      <nav className="sidebar-section-list">
        {SYSTEM_SECTIONS.map((s) => (
          <button
            key={s.id}
            className={`sidebar-row${activeSection === s.id && !activeTagName ? " sidebar-row--active" : ""}`}
            onClick={() => setSection(s.id)}
          >
            <span className="sidebar-row-icon">
              <SystemSectionIcon icon={s.icon} />
            </span>
            <span className="sidebar-row-label">{s.label}</span>
          </button>
        ))}
      </nav>

      {/* Tags section */}
      {rootTags.length > 0 && (
        <>
          <div className="sidebar-divider" />
          <div className="sidebar-section-heading">Tags</div>
          <div className="sidebar-tag-list">
            {rootTags.map((tag) => (
              <TagRow
                key={tag.name}
                tag={tag}
                depth={0}
                active={activeTagName === tag.name}
                expanded={expandedTags.has(tag.name)}
                children={childrenOf(tag.name)}
                allTags={tags}
                activeTagName={activeTagName}
                onSelect={setActiveTag}
                onToggle={toggleTagExpand}
              />
            ))}
          </div>
        </>
      )}

      {/* Bottom actions */}
      <div className="sidebar-bottom">

      </div>
    </aside>
  );
}

function SystemSectionIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon size={14} strokeWidth={2} aria-hidden="true" focusable="false" />;
}

function TagRow({
  tag,
  depth,
  active,
  expanded,
  children,
  allTags,
  activeTagName,
  onSelect,
  onToggle,
}: {
  tag: Tag;
  depth: number;
  active: boolean;
  expanded: boolean;
  children: Tag[];
  allTags: Tag[];
  activeTagName: string | null;
  onSelect: (name: string) => void;
  onToggle: (name: string) => void;
}) {
  const hasChildren = children.length > 0;
  // Show only the last segment of a nested tag name as the label.
  const segments = tag.name.split("/");
  const label = segments[segments.length - 1];

  return (
    <>
      <button
        className={`sidebar-row sidebar-tag-row${active ? " sidebar-row--active" : ""}`}
        style={{ paddingLeft: `${14 + depth * 14}px` }}
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
        <span className="sidebar-row-icon sidebar-tag-icon">#</span>
        <span className="sidebar-row-label">{label}</span>
        <span className="sidebar-tag-count">{tag.note_count}</span>
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
