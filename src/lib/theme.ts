export const themePresets = ["icloud", "explorer", "notion", "drive"] as const;
export type ThemePreset = typeof themePresets[number];

const THEME_KEY = "openlist-drive-theme";
const THEME_FLOW_KEY = "openlist-drive-theme-flow";
const THEME_COLORS: Record<ThemePreset, string> = {
  icloud: "#e2fbf2",
  explorer: "#f3f3f3",
  notion: "#f7f7f5",
  drive: "#e8f0fe",
};

export function isThemePreset(value: unknown): value is ThemePreset {
  return typeof value === "string" && themePresets.includes(value as ThemePreset);
}

export function readStoredTheme(): ThemePreset {
  if (typeof localStorage === "undefined") return "icloud";
  const stored = localStorage.getItem(THEME_KEY);
  return isThemePreset(stored) ? stored : "icloud";
}

export function readStoredThemeFlowing() {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(THEME_FLOW_KEY) === "on";
}

export function applyTheme(theme: ThemePreset, flowing = readStoredThemeFlowing()) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themeFlow = flowing ? "flowing" : "static";
  localStorage.setItem(THEME_KEY, theme);
  localStorage.setItem(THEME_FLOW_KEY, flowing ? "on" : "off");
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
}
