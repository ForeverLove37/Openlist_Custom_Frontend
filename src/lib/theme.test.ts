// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme, readStoredTheme, readStoredThemeFlowing } from "./theme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-flow");
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff">';
});

describe("theme preferences", () => {
  it("falls back to iCloud when the saved value is absent or invalid", () => {
    expect(readStoredTheme()).toBe("icloud");
    localStorage.setItem("openlist-drive-theme", "unknown");
    expect(readStoredTheme()).toBe("icloud");
  });

  it("applies and persists a selected preset", () => {
    applyTheme("drive", true);
    expect(document.documentElement.dataset.theme).toBe("drive");
    expect(document.documentElement.dataset.themeFlow).toBe("flowing");
    expect(localStorage.getItem("openlist-drive-theme-flow")).toBe("on");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#e8f0fe");
    expect(readStoredThemeFlowing()).toBe(true);

    applyTheme("explorer", false);
    expect(document.documentElement.dataset.theme).toBe("explorer");
    expect(document.documentElement.dataset.themeFlow).toBe("static");
    expect(localStorage.getItem("openlist-drive-theme")).toBe("explorer");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#f3f3f3");
    expect(readStoredTheme()).toBe("explorer");
    expect(readStoredThemeFlowing()).toBe(false);
  });
});
