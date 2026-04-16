import { useState } from "react";
import { createPortal } from "react-dom";
import { ThemesTab } from "./ThemesTab";
import { TypographyTab } from "./TypographyTab";
import { GeneralTab } from "./GeneralTab";
import "./SettingsModal.css";

type Tab = "general" | "typography" | "themes";

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>("themes");

  return createPortal(
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="settings-sidebar">
          <div className="settings-logo">Settings</div>
          {(["general", "typography", "themes"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`settings-tab-btn${tab === t ? " active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="settings-content">
          <button className="settings-close" onClick={onClose} title="Close">✕</button>
          {tab === "general"    && <GeneralTab />}
          {tab === "typography" && <TypographyTab />}
          {tab === "themes"     && <ThemesTab />}
        </div>
      </div>
    </div>,
    document.body
  );
}
