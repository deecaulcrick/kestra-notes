import { useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useNoteStore } from "./store/noteStore";
import { Library } from "./views/Library";
import "./App.css";

export default function App() {
  const workspace = useNoteStore((s) => s.workspace);
  const isLoading = useNoteStore((s) => s.isLoading);
  const error = useNoteStore((s) => s.error);
  const openVault = useNoteStore((s) => s.openVault);

  // On first launch, try to reopen the last vault from localStorage.
  useEffect(() => {
    const lastPath = localStorage.getItem("lastVaultPath");
    if (lastPath) void openVault(lastPath);
  }, []);

  // Persist vault path whenever it changes.
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
