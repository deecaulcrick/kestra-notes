import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Sidebar } from "../components/Sidebar/Sidebar";
import { NoteList } from "../components/NoteList/NoteList";
import { Editor } from "../components/Editor/Editor";
import { BacklinksPanel } from "../components/BacklinksPanel/BacklinksPanel";
import { SettingsModal } from "../components/Settings/SettingsModal";
import { useNoteStore } from "../store/noteStore";
import { useUIStore } from "../store/uiStore";
import { useThemeStore } from "../store/themeStore";
import "./Library.css";

export function Library() {
  const activeNoteId = useNoteStore((s) => s.activeNoteId);
  const loadNotes = useNoteStore((s) => s.loadNotes);
  const loadSettings = useThemeStore((s) => s.loadSettings);

  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const noteListCollapsed = useUIStore((s) => s.noteListCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const toggleNoteList = useUIStore((s) => s.toggleNoteList);
  const toggleBacklinks = useUIStore((s) => s.toggleBacklinks);

  const [settingsOpen, setSettingsOpen] = useState(false);

  // Load persisted settings when vault opens.
  useEffect(() => { void loadSettings(); }, []);

  // Refresh note list on file watcher events.
  useEffect(() => {
    const unlisten = listen("notes://changed", () => { void loadNotes(); });
    return () => { void unlisten.then((fn) => fn()); };
  }, []);

  // Keyboard shortcuts for pane collapse.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.shiftKey && e.key === "1") { e.preventDefault(); toggleSidebar(); }
      if (e.shiftKey && e.key === "2") { e.preventDefault(); toggleNoteList(); }
      if (e.shiftKey && e.key === "b") { e.preventDefault(); toggleBacklinks(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="library">
      {/* Left pane — sidebar */}
      <div className={`library-sidebar-pane${sidebarCollapsed ? " collapsed" : ""}`}>
        <Sidebar onSettings={() => setSettingsOpen(true)} />
      </div>

      {/* Middle pane — note list */}
      <div className={`library-notelist-pane${noteListCollapsed ? " collapsed" : ""}`}>
        <NoteList />
      </div>

      {/* Right column — editor + backlinks */}
      <div className="library-editor-col">
        <div className="library-editor-pane">
          <Editor noteId={activeNoteId} />
        </div>
        <BacklinksPanel />
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
