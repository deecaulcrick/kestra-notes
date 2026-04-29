import { create } from "zustand";

export type SidebarSection =
  | "notes"
  | "untagged"
  | "todo"
  | "today"
  | "trash"
  | "pinned";

export type AppView = "library" | "canvas";

interface UIStore {
  // Pane collapse state
  sidebarCollapsed: boolean;
  noteListCollapsed: boolean;
  backlinksCollapsed: boolean;

  // Main content view
  activeView: AppView;

  // Sidebar selection
  activeSection: SidebarSection;
  activeTagName: string | null;

  // Active note in the editor pane
  activeNoteId: string | null;

  // Actions
  toggleSidebar: () => void;
  toggleNoteList: () => void;
  toggleBacklinks: () => void;
  setActiveView: (view: AppView) => void;
  setSection: (section: SidebarSection) => void;
  setActiveTag: (tagName: string | null) => void;
  setActiveNoteId: (id: string | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarCollapsed: false,
  noteListCollapsed: false,
  backlinksCollapsed: false,
  activeView: "library",

  activeSection: "notes",
  activeTagName: null,
  activeNoteId: null,

  toggleSidebar:   () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleNoteList:  () => set((s) => ({ noteListCollapsed: !s.noteListCollapsed })),
  toggleBacklinks: () => set((s) => ({ backlinksCollapsed: !s.backlinksCollapsed })),
  setActiveView:   (view) => set({ activeView: view }),

  setSection:      (section) => set({ activeSection: section, activeTagName: null, activeView: "library" }),
  setActiveTag:    (tagName) => set({ activeTagName: tagName, activeSection: "notes", activeView: "library" }),
  setActiveNoteId: (id) => set({ activeNoteId: id }),
}));
