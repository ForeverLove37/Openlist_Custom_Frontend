import { describe, expect, it } from "vitest";
import {
  directoryPathFromLocation,
  formatSize,
  getFileKind,
  joinPath,
  locationFromDirectoryPath,
  sortItems,
} from "./files";
import type { OpenListItem } from "./types";

function item(name: string, isDir = false, size = 0): OpenListItem {
  return {
    name,
    is_dir: isDir,
    size,
    modified: "2026-01-01T00:00:00Z",
    created: "2026-01-01T00:00:00Z",
    sign: "",
    thumb: "",
    type: 0,
    hashinfo: "",
  };
}

describe("file helpers", () => {
  it("classifies common media without relying on API type numbers", () => {
    expect(getFileKind(item("photo.WEBP"))).toBe("image");
    expect(getFileKind(item("clip.mkv"))).toBe("video");
    expect(getFileKind(item("Projects", true))).toBe("folder");
  });

  it("keeps folders first while sorting files naturally", () => {
    const result = sortItems([item("file10.txt"), item("Folder", true), item("file2.txt")], "name", "asc");
    expect(result.map((entry) => entry.name)).toEqual(["Folder", "file2.txt", "file10.txt"]);
  });

  it("round trips encoded directory URLs", () => {
    const path = "/Family photos/July #1";
    const location = locationFromDirectoryPath(path);
    expect(location).toBe("/files/Family%20photos/July%20%231");
    expect(directoryPathFromLocation(location)).toBe(path);
    expect(joinPath("/Family photos", "portrait.jpg")).toBe("/Family photos/portrait.jpg");
  });

  it("formats file sizes for scanning", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(1_572_864)).toBe("1.5 MB");
  });
});
