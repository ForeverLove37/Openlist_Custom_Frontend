// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme, readStoredTheme } from "./theme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff">';
});

describe("theme preferences", () => {
  it("falls back to iCloud when the saved value is absent or invalid", () => {
    expect(readStoredTheme()).toBe("icloud");
    localStorage.setItem("openlist-drive-theme", "unknown");
    expect(readStoredTheme()).toBe("icloud");
  });

  it("applies and persists a selected preset", () => {
    applyTheme("explorer");
    expect(document.documentElement.dataset.theme).toBe("explorer");
    expect(localStorage.getItem("openlist-drive-theme")).toBe("explorer");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#f3f3f3");
    expect(readStoredTheme()).toBe("explorer");
  });
});
