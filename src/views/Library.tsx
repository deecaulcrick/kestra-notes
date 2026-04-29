import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Sidebar } from "../components/Sidebar/Sidebar";
import { NoteList } from "../components/NoteList/NoteList";
import { EditorPane } from "../components/Editor/EditorPane";
import { SettingsModal } from "../components/Settings/SettingsModal";
import { CanvasView } from "./Canvas";
import { useNoteStore } from "../store/noteStore";
import { useUIStore } from "../store/uiStore";
import { useThemeStore } from "../store/themeStore";
import "./Library.css";

export function Library() {
  const loadNotes    = useNoteStore((s) => s.loadNotes);
  const loadSettings = useThemeStore((s) => s.loadSettings);

  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar    = useUIStore((s) => s.toggleSidebar);
  const activeNoteId     = useUIStore((s) => s.activeNoteId);
  const activeView       = useUIStore((s) => s.activeView);

  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => { void loadSettings(); }, []);

  useEffect(() => {
    const unlisten = listen("notes://changed", () => { void loadNotes(); });
    return () => { void unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.shiftKey && e.key === "1") { e.preventDefault(); toggleSidebar(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="library">
      {/* Pane 1 — Sidebar */}
      <div className={`library-sidebar-pane${sidebarCollapsed ? " collapsed" : ""}`}>
        <Sidebar onSettings={() => setSettingsOpen(true)} />
      </div>

      {activeView === "canvas" ? (
        <div className="library-canvas-pane">
          <CanvasView />
        </div>
      ) : (
        <>
          {/* Pane 2 — Note list */}
          <div className="library-notelist-pane">
            <NoteList />
          </div>

          {/* Pane 3 — Editor */}
          <div className="library-editor-pane">
            {activeNoteId
              ? <EditorPane noteId={activeNoteId} />
              : <div className="library-editor-empty">Select a note or press + to create one.</div>
            }
          </div>
        </>
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
