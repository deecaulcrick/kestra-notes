import { create } from "zustand";
import { saveSettings, getSettings } from "../lib/tauri";

export type ThemeId =
  | "light"
  | "dark"
  | "midnight"
  | "matcha"
  | "overcast"
  | "nightshade";

export interface TypographySettings {
  textFont: string;
  headingsFont: string;
  codeFont: string;
  fontSize: number;
  lineHeight: number;
  lineWidth: number;
  paragraphSpacing: number;
  paragraphIndent: number;
}

const DEFAULT_TYPOGRAPHY: TypographySettings = {
  textFont: "Nunito Sans",
  headingsFont: "Nunito Sans",
  codeFont: "JetBrains Mono",
  fontSize: 17,
  lineHeight: 1.75,
  lineWidth: 48,
  paragraphSpacing: 0,
  paragraphIndent: 0,
};

interface ThemeStore {
  activeTheme: ThemeId;
  typography: TypographySettings;
  setTheme: (id: ThemeId) => void;
  setTypography: (patch: Partial<TypographySettings>) => void;
  resetTypography: () => void;
  loadSettings: () => Promise<void>;
}

function applyTheme(id: ThemeId) {
  document.documentElement.setAttribute("data-theme", id);
  localStorage.setItem("theme", id);
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  activeTheme: (localStorage.getItem("theme") as ThemeId) ?? "light",
  typography: DEFAULT_TYPOGRAPHY,

  setTheme: (id) => {
    applyTheme(id);
    set({ activeTheme: id });
    const t = get().typography;
    void saveSettings({
      theme: id,
      text_font: t.textFont,
      headings_font: t.headingsFont,
      code_font: t.codeFont,
      font_size: t.fontSize,
      line_height: t.lineHeight,
      line_width: t.lineWidth,
      paragraph_spacing: t.paragraphSpacing,
      paragraph_indent: t.paragraphIndent,
    });
  },

  setTypography: (patch) => {
    const next = { ...get().typography, ...patch };
    set({ typography: next });
    const theme = get().activeTheme;
    void saveSettings({
      theme,
      text_font: next.textFont,
      headings_font: next.headingsFont,
      code_font: next.codeFont,
      font_size: next.fontSize,
      line_height: next.lineHeight,
      line_width: next.lineWidth,
      paragraph_spacing: next.paragraphSpacing,
      paragraph_indent: next.paragraphIndent,
    });
  },

  resetTypography: () => {
    get().setTypography(DEFAULT_TYPOGRAPHY);
  },

  loadSettings: async () => {
    try {
      const s = await getSettings();
      const typography: TypographySettings = {
        textFont: s.text_font,
        headingsFont: s.headings_font,
        codeFont: s.code_font,
        fontSize: s.font_size,
        lineHeight: s.line_height,
        lineWidth: s.line_width,
        paragraphSpacing: s.paragraph_spacing,
        paragraphIndent: s.paragraph_indent,
      };
      const themeId = s.theme as ThemeId;
      applyTheme(themeId);
      set({ activeTheme: themeId, typography });
    } catch {
      // Vault not open yet — keep defaults.
    }
  },
}));
