import { useThemeStore, type ThemeId } from "../../store/themeStore";
import "./ThemesTab.css";

interface ThemeMeta {
  id: ThemeId;
  label: string;
  pro: boolean;
}

const THEMES: ThemeMeta[] = [
  { id: "light", label: "Default", pro: false },
  { id: "dark", label: "Dark", pro: false },
  { id: "nightshade", label: "Nightshade", pro: false },
  { id: "matcha", label: "Matcha", pro: false },
  { id: "overcast", label: "Overcast", pro: false },
  { id: "midnight", label: "Midnight", pro: false },

];

export function ThemesTab() {
  const activeTheme = useThemeStore((s) => s.activeTheme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div>
      <h2 className="settings-section-title">Themes</h2>
      <div className="themes-grid">
        {THEMES.map((theme) => (
          <ThemeCard
            key={theme.id}
            meta={theme}
            active={activeTheme === theme.id}
            onSelect={() => {
              if (!theme.pro) setTheme(theme.id);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ThemeCard({
  meta,
  active,
  onSelect,
}: {
  meta: ThemeMeta;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`theme-card${active ? " theme-card--active" : ""}${meta.pro ? " theme-card--pro" : ""}`}
      data-theme={meta.id}
      onClick={onSelect}
      title={meta.pro ? "Coming soon — PRO feature" : meta.label}
    >
      {meta.pro && <span className="theme-card-pro-badge">PRO</span>}

      <div className="theme-card-preview">
        <div className="theme-preview-title">{meta.label}</div>
        <div className="theme-preview-body">
          Lorem ipsum <strong>dolor sit amet</strong>,{" "}
          consecttetur adipscing elit. Mauris laculis <em>semper</em> pharetra.
        </div>
      </div>
    </button>
  );
}
