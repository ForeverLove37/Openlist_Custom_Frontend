import { describe, expect, it, vi } from "vitest";
import { createThumbnailService, fallbackSvg, normalizeOpenListPath, thumbnailCacheKey } from "./thumbnail-service.js";

describe("thumbnail service helpers", () => {
  it("normalizes safe OpenList paths and rejects traversal", () => {
    expect(normalizeOpenListPath("/Pictures//Summer/photo.jpg")).toBe("/Pictures/Summer/photo.jpg");
    expect(() => normalizeOpenListPath("Pictures/photo.jpg")).toThrow("valid OpenList path");
    expect(() => normalizeOpenListPath("/Pictures/../secret.jpg")).toThrow("thumbnail path is invalid");
  });

  it("partitions cache keys by user, path, and media type", () => {
    const base = thumbnailCacheKey(2, "/Photos/cover.jpg", "image");
    expect(base).toMatch(/^[a-f0-9]{64}$/);
    expect(thumbnailCacheKey(3, "/Photos/cover.jpg", "image")).not.toBe(base);
    expect(thumbnailCacheKey(2, "/Photos/cover.jpg", "video")).not.toBe(base);
  });

  it("verifies a session with OpenList before storing it in memory", async () => {
    const httpClient = { request: vi.fn().mockResolvedValue({ status: 200, data: { code: 200, data: { id: 7 } } }) };
    const service = createThumbnailService({ openListBaseUrl: "http://openlist.test", cacheDir: "/tmp/openlist-thumb-test", httpClient });
    const session = await service.createSession("jwt-token", "/Pictures", "folder-password");

    expect(httpClient.request).toHaveBeenCalledWith(expect.objectContaining({
      url: "http://openlist.test/api/me",
      headers: { Authorization: "jwt-token" },
    }));
    expect(service.getSession(session.id)).toMatchObject({ userId: 7, authorization: "jwt-token" });
  });

  it("uses a media-specific SVG fallback", () => {
    expect(fallbackSvg("video")).toContain("VIDEO PREVIEW UNAVAILABLE");
    expect(fallbackSvg("image")).toContain("IMAGE PREVIEW UNAVAILABLE");
  });
});
