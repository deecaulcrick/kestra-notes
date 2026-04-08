import { Sidebar } from "../components/Sidebar";
import { Editor } from "../components/Editor/Editor";
import { RightPanel } from "../components/RightPanel";
import { CommandPalette, useCommandPalette } from "../components/CommandPalette";
import { useNoteStore } from "../store/noteStore";
import "./Library.css";

export function Library() {
  const activeNoteId = useNoteStore((s) => s.activeNoteId);
  const { isOpen, close } = useCommandPalette();

  return (
    <div className="library">
      <Sidebar />

      <main className="library-editor-pane">
        <Editor noteId={activeNoteId} />
      </main>

      <RightPanel />

      {isOpen && <CommandPalette onClose={close} />}
    </div>
  );
}
