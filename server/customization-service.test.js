import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { CustomizationError, createCustomizationService } from "./customization-service.js";

async function sampleImage() {
  return sharp({ create: { width: 640, height: 480, channels: 4, background: "#087b76" } }).png().toBuffer();
}

describe("customization service", () => {
  it("persists branding and produces normalized logo and web-icon assets", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "openlist-customization-"));
    const service = createCustomizationService({ dataDir });
    try {
      expect(await service.getBranding()).toEqual({ name: "OpenList Drive", logoUrl: "", iconUrl: "" });
      await service.updateBranding({ name: "Team Drive" });
      await service.saveBrandAsset("logo", await sampleImage(), "image/png");
      const branding = await service.saveBrandAsset("icon", await sampleImage(), "image/png");

      expect(branding).toMatchObject({ name: "Team Drive" });
      expect(branding.logoUrl).toMatch(/^\/api\/custom\/branding\/logo\?v=/);
      expect(branding.iconUrl).toMatch(/^\/api\/custom\/branding\/icon\?v=/);
      expect((await sharp(await service.getBrandAssetFile("logo")).metadata()).format).toBe("webp");
      expect(await sharp(await service.getBrandAssetFile("icon")).metadata()).toMatchObject({ format: "png", width: 128, height: 128 });
      expect(JSON.parse(await readFile(path.join(dataDir, "branding.json"), "utf8"))).toEqual({ name: "Team Drive" });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("partitions avatars by verified OpenList user ID and supports reset", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "openlist-avatar-"));
    const service = createCustomizationService({ dataDir });
    try {
      const profile = await service.saveAvatar(7, await sampleImage(), "image/png");
      expect(profile.avatarUrl).toMatch(/^\/api\/custom\/profile\/avatar\?v=/);
      expect((await sharp(await service.getAvatarFile(7)).metadata()).format).toBe("webp");
      await expect(service.getAvatarFile(8)).rejects.toMatchObject({ status: 404 });
      expect(await service.deleteAvatar(7)).toEqual({ avatarUrl: "" });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("rejects unsafe image types, oversized inputs, and invalid branding values", async () => {
    const service = createCustomizationService({ dataDir: path.join(tmpdir(), "unused-openlist-customization") });
    await expect(service.saveAvatar(2, Buffer.from("<svg/>"), "image/svg+xml")).rejects.toMatchObject({ status: 415 });
    await expect(service.saveAvatar(2, Buffer.alloc(5 * 1024 * 1024 + 1), "image/png")).rejects.toMatchObject({ status: 413 });
    await expect(service.updateBranding({ name: " " })).rejects.toBeInstanceOf(CustomizationError);
    expect(() => service.getBrandAssetFile("script")).toThrow(CustomizationError);
  });
});
