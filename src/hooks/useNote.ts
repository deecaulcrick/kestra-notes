import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { getNote, saveNote } from "../lib/tauri";
import { useNoteStore } from "../store/noteStore";

export type SaveStatus = "idle" | "saving" | "saved";

/**
 * Manages loading and saving a note into a Tiptap editor.
 *
 * - When `noteId` changes, reads the file from disk and sets the editor content.
 * - Exposes `scheduleSave(content)` which debounces 300ms then calls `save_note`.
 * - Loading is guarded by a ref so it doesn't trigger a spurious save.
 */
export function useNote(noteId: string | null, editor: Editor | null) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // True while setContent() is in progress — prevents the update callback
  // from triggering a save for content we just loaded from disk.
  const isLoadingRef = useRef<boolean>(false);
  const loadNotes = useNoteStore((s) => s.loadNotes);

  useEffect(() => {
    if (!noteId || !editor) return;

    let cancelled = false;
    isLoadingRef.current = true;

    getNote(noteId)
      .then((note) => {
        if (cancelled) return;
        // setContent will trigger onUpdate — the flag suppresses the save.
        editor.commands.setContent(note.content);
        // Give the editor one tick to settle before allowing saves.
        setTimeout(() => {
          if (!cancelled) isLoadingRef.current = false;
        }, 50);
      })
      .catch((err) => {
        console.error("Failed to load note:", err);
        isLoadingRef.current = false;
      });

    return () => {
      cancelled = true;
      isLoadingRef.current = false;
      clearTimeout(timerRef.current);
    };
  }, [noteId, editor]);

  const scheduleSave = useCallback(
    (content: string) => {
      if (!noteId || isLoadingRef.current) return;

      setSaveStatus("saving");
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        try {
          await saveNote(noteId, content);
          // Refresh the sidebar title in case the H1 changed.
          await loadNotes();
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        } catch (err) {
          console.error("Save failed:", err);
          setSaveStatus("idle");
        }
      }, 300);
    },
    [noteId, loadNotes]
  );

  return { saveStatus, scheduleSave };
}
