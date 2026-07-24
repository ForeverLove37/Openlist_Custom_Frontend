import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { cacheVideoSource, createThumbnailService, fallbackSvg, normalizeOpenListPath, thumbnailCacheKey } from "./thumbnail-service.js";

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
    const httpClient = { request: vi.fn().mockResolvedValue({ status: 200, data: { code: 200, data: { id: 7, role: 2 } } }) };
    const service = createThumbnailService({ openListBaseUrl: "http://openlist.test", cacheDir: "/tmp/openlist-thumb-test", httpClient });
    const session = await service.createSession("jwt-token", "/Pictures", "folder-password");

    expect(httpClient.request).toHaveBeenCalledWith(expect.objectContaining({
      url: "http://openlist.test/api/me",
      headers: { Authorization: "jwt-token" },
    }));
    expect(service.getSession(session.id)).toMatchObject({ userId: 7, role: 2, authorization: "jwt-token" });
  });

  it("pipes a source image stream through Sharp and caches WebP output", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "openlist-thumb-test-"));
    const input = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#0f766e" } }).png().toBuffer();
    const httpClient = {
      request: vi.fn()
        .mockResolvedValueOnce({ status: 200, data: { code: 200, data: { id: 7, role: 2 } } })
        .mockResolvedValueOnce({ status: 200, data: { code: 200, data: { raw_url: "http://openlist.test/photo.png" } } }),
      get: vi.fn().mockResolvedValue({ status: 200, data: Readable.from(input) }),
    };
    const service = createThumbnailService({ openListBaseUrl: "http://openlist.test", cacheDir, httpClient });

    try {
      const session = await service.createSession("jwt-token", "/Pictures");
      const output = await service.getThumbnail(service.getSession(session.id), "/Pictures/photo.png", "image");
      const metadata = await sharp(output).metadata();

      expect(metadata.format).toBe("webp");
      expect(metadata.width).toBe(400);
      expect(metadata.height).toBe(300);
      expect(httpClient.get).toHaveBeenCalledWith("http://openlist.test/photo.png", expect.objectContaining({
        responseType: "stream",
        maxRedirects: 5,
        headers: { Authorization: "jwt-token" },
      }));
      expect(service.ffmpegPath).toBe("/usr/bin/ffmpeg");
      expect(service.maxRedirects).toBe(5);
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it("uses a media-specific SVG fallback", () => {
    expect(fallbackSvg("video")).toContain("VIDEO PREVIEW UNAVAILABLE");
    expect(fallbackSvg("image")).toContain("IMAGE PREVIEW UNAVAILABLE");
  });

  it("writes a bounded local video source before FFmpeg reads it", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "openlist-thumb-video-source-"));
    const target = path.join(cacheDir, "source.bin");
    try {
      await expect(cacheVideoSource({ data: Readable.from(Buffer.from("video-data")), headers: { "content-length": "10" } }, target, 64)).resolves.toBe(10);
      await expect(cacheVideoSource({ data: Readable.from(Buffer.alloc(65)), headers: {} }, `${target}.oversize`, 64)).rejects.toThrow("thumbnail limit");
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });
});
