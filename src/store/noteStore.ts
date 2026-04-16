import { create } from "zustand";
import {
  type Note,
  type Workspace,
  openVault,
  listNotes,
  createNote,
  getNotesByTag,
  pinNote,
  deleteNote,
} from "../lib/tauri";

interface NoteStore {
  workspace: Workspace | null;
  isLoading: boolean;
  error: string | null;
  notes: Note[];
  activeNoteId: string | null;

  openVault: (path: string) => Promise<void>;
  createNote: (title?: string) => Promise<void>;
  loadNotes: () => Promise<void>;
  loadNotesByTag: (tagName: string) => Promise<void>;
  setActiveNote: (id: string) => void;
  pinNote: (id: string, pinned: boolean) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
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
      await get().loadNotes();
    } catch (e) {
      set({ isLoading: false, error: String(e) });
    }
  },

  createNote: async (title = "Untitled") => {
    try {
      const note = await createNote(title);
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

  loadNotesByTag: async (tagName: string) => {
    try {
      const notes = await getNotesByTag(tagName);
      set({ notes });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setActiveNote: (id: string) => {
    set({ activeNoteId: id });
  },

  pinNote: async (id: string, pinnedVal: boolean) => {
    await pinNote(id, pinnedVal);
    set((s) => ({
      notes: s.notes.map((n) => n.id === id ? { ...n, pinned: pinnedVal } : n),
    }));
  },

  deleteNote: async (id: string) => {
    await deleteNote(id);
    set((s) => ({
      notes: s.notes.filter((n) => n.id !== id),
      activeNoteId: s.activeNoteId === id ? null : s.activeNoteId,
    }));
  },
}));
