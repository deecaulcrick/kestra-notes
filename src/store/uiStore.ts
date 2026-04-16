import { create } from "zustand";

export type SidebarSection =
  | "notes"
  | "untagged"
  | "todo"
  | "today"
  | "trash"
  | "pinned";

interface UIStore {
  // Pane collapse state
  sidebarCollapsed: boolean;
  noteListCollapsed: boolean;
  backlinksCollapsed: boolean;

  // Sidebar selection
  activeSection: SidebarSection;
  activeTagName: string | null;

  // Actions
  toggleSidebar: () => void;
  toggleNoteList: () => void;
  toggleBacklinks: () => void;
  setSection: (section: SidebarSection) => void;
  setActiveTag: (tagName: string | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarCollapsed: false,
  noteListCollapsed: false,
  backlinksCollapsed: false,

  activeSection: "notes",
  activeTagName: null,

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleNoteList: () => set((s) => ({ noteListCollapsed: !s.noteListCollapsed })),
  toggleBacklinks: () => set((s) => ({ backlinksCollapsed: !s.backlinksCollapsed })),

  setSection: (section) => set({ activeSection: section, activeTagName: null }),
  setActiveTag: (tagName) => set({ activeTagName: tagName, activeSection: "notes" }),
}));
