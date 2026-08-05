export const themePresets = ["icloud", "explorer", "notion"] as const;
export type ThemePreset = typeof themePresets[number];

const THEME_KEY = "openlist-drive-theme";
const THEME_COLORS: Record<ThemePreset, string> = {
  icloud: "#e2fbf2",
  explorer: "#f3f3f3",
  notion: "#f7f7f5",
};

export function isThemePreset(value: unknown): value is ThemePreset {
  return typeof value === "string" && themePresets.includes(value as ThemePreset);
}

export function readStoredTheme(): ThemePreset {
  if (typeof localStorage === "undefined") return "icloud";
  const stored = localStorage.getItem(THEME_KEY);
  return isThemePreset(stored) ? stored : "icloud";
}

export function applyTheme(theme: ThemePreset) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
}
