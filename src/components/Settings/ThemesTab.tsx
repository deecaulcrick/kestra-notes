import { useThemeStore, type ThemeId } from "../../store/themeStore";
import "./ThemesTab.css";

interface ThemeMeta {
  id: ThemeId;
  label: string;
  pro: boolean;
}

const THEMES: ThemeMeta[] = [
  { id: "light",           label: "Default",         pro: false },
  { id: "dark-graphite",   label: "Dark Graphite",   pro: false },
  { id: "high-contrast",   label: "High Contrast",   pro: false },
  { id: "forest",        label: "Forest",        pro: false  },
  { id: "solarized-light", label: "Solarized Light", pro: false  },
  { id: "solarized-dark",  label: "Solarized Dark",  pro: false  },
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
        <div className="theme-preview-title">Note title</div>
        <div className="theme-preview-body">
          Lorem ipsum <strong>dolor sit amet</strong>,{" "}
          <em>consectetur</em> adipiscing.
        </div>
      </div>

      <div className="theme-card-label">{meta.label}</div>
    </button>
  );
}
