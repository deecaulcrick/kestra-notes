import { create } from "zustand";
import { type Note, type Workspace, openVault, listNotes, createNote } from "../lib/tauri";

interface NoteStore {
  // Vault state
  workspace: Workspace | null;
  isLoading: boolean;
  error: string | null;

  // Note list
  notes: Note[];
  activeNoteId: string | null;

  // Actions
  openVault: (path: string) => Promise<void>;
  createNote: (title?: string) => Promise<void>;
  loadNotes: () => Promise<void>;
  setActiveNote: (id: string) => void;
}

export const useNoteStore = create<NoteStore>((set, get) => ({
  workspace: null,
  isLoading: false,
  error: null,
  notes: [],
  activeNoteId: null,

  openVault: async (path: string) => {
    set({ isLoading: true, error: null });
    try {
      const workspace = await openVault(path);
      set({ workspace, isLoading: false });
      // Load notes immediately after opening vault.
      await get().loadNotes();
    } catch (e) {
      set({ isLoading: false, error: String(e) });
    }
  },

  createNote: async (title = "Untitled") => {
    try {
      const note = await createNote(title);
      // Prepend to list and immediately select the new note.
      set((s) => ({ notes: [note, ...s.notes], activeNoteId: note.id }));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  loadNotes: async () => {
    try {
      const notes = await listNotes();
      set({ notes });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setActiveNote: (id: string) => {
    set({ activeNoteId: id });
  },
}));
