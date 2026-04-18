import { useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useNoteStore } from "./store/noteStore";
import { Library } from "./views/Library";
import { NoteWindowWithVault } from "./views/NoteWindow";
import "./App.css";

// Detect if this window was opened as a note window via query params.
const params = new URLSearchParams(window.location.search);
const WINDOW_NOTE_ID = params.get("noteId");
const WINDOW_TAG = params.get("tag") ?? "";

export default function App() {
  // ── Note window mode ──────────────────────────────────────────────────────
  if (WINDOW_NOTE_ID) {
    return <NoteWindowWithVault noteId={WINDOW_NOTE_ID} tag={WINDOW_TAG} />;
  }

  // ── Library (main window) mode ────────────────────────────────────────────
  return <LibraryApp />;
}

function LibraryApp() {
  const workspace = useNoteStore((s) => s.workspace);
  const isLoading = useNoteStore((s) => s.isLoading);
  const error = useNoteStore((s) => s.error);
  const openVault = useNoteStore((s) => s.openVault);

  useEffect(() => {
    const lastPath = localStorage.getItem("lastVaultPath");
    if (lastPath) void openVault(lastPath);
  }, []);

  useEffect(() => {
    if (workspace?.vault_path) {
      localStorage.setItem("lastVaultPath", workspace.vault_path);
    }
  }, [workspace?.vault_path]);

  async function handleOpenVault() {
    const selected = await open({ directory: true, multiple: false });
    if (selected) await openVault(selected as string);
  }

  if (workspace) return <Library />;

  return (
    <div className="vault-picker">
      <div className="vault-picker-card">
        <h1 className="vault-picker-title">limitless</h1>
        <p className="vault-picker-subtitle">A local-first writing tool for connected thought.</p>

        {error && <p className="vault-picker-error">{error}</p>}

        <button
          className="vault-picker-btn"
          onClick={handleOpenVault}
          disabled={isLoading}
        >
          {isLoading ? "Opening…" : "Open Vault"}
        </button>
      </div>
    </div>
  );
}
