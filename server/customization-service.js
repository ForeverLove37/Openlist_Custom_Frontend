import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DEFAULT_NAME = "OpenList Drive";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_INPUT_PIXELS = 25_000_000;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export class CustomizationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "CustomizationError";
    this.status = status;
  }
}

function validUserId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 0) throw new CustomizationError("The user ID is invalid.");
  return id;
}

async function fileRevision(file) {
  const info = await stat(file).catch(() => null);
  return info?.isFile() && info.size > 0 ? Math.floor(info.mtimeMs).toString(36) : "";
}

async function atomicWrite(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporaryFile = `${file}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await writeFile(temporaryFile, contents, { flag: "wx", mode: 0o600 });
    await rename(temporaryFile, file);
  } catch (error) {
    await unlink(temporaryFile).catch(() => {});
    throw error;
  }
}

function validateImage(input, contentType) {
  if (!ACCEPTED_IMAGE_TYPES.has(contentType)) {
    throw new CustomizationError("Use a PNG, JPEG, WebP, or GIF image.", 415);
  }
  if (!Buffer.isBuffer(input) || input.length === 0) throw new CustomizationError("Choose a non-empty image.");
  if (input.length > MAX_IMAGE_BYTES) throw new CustomizationError("Images must be 5 MB or smaller.", 413);
}

async function normalizeImage(input, contentType, targetFile, kind) {
  validateImage(input, contentType);
  await mkdir(path.dirname(targetFile), { recursive: true });
  const temporaryFile = `${targetFile}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    const image = sharp(input, { animated: false, limitInputPixels: MAX_INPUT_PIXELS }).rotate();
    if (kind === "icon") {
      await image.resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toFile(temporaryFile);
    } else if (kind === "logo") {
      await image.resize({ width: 640, height: 240, fit: "inside", withoutEnlargement: true }).webp({ quality: 88 }).toFile(temporaryFile);
    } else {
      await image.resize(512, 512, { fit: "cover", position: "attention", withoutEnlargement: true }).webp({ quality: 86 }).toFile(temporaryFile);
    }
    await rename(temporaryFile, targetFile);
  } catch (error) {
    await unlink(temporaryFile).catch(() => {});
    if (error instanceof CustomizationError) throw error;
    throw new CustomizationError("The selected file is not a valid supported image.");
  }
}

export function createCustomizationService({
  dataDir = process.env.CUSTOMIZATION_DATA_DIR || path.resolve(".data/customization"),
} = {}) {
  const brandingFile = path.join(dataDir, "branding.json");
  const logoFile = path.join(dataDir, "branding-logo.webp");
  const iconFile = path.join(dataDir, "branding-icon.png");
  const avatarDir = path.join(dataDir, "avatars");

  function brandAssetFile(kind) {
    if (kind !== "logo" && kind !== "icon") throw new CustomizationError("The branding asset is invalid.");
    return kind === "logo" ? logoFile : iconFile;
  }

  async function readBrandingName() {
    try {
      const stored = JSON.parse(await readFile(brandingFile, "utf8"));
      return typeof stored.name === "string" && stored.name.trim() ? stored.name.trim().slice(0, 60) : DEFAULT_NAME;
    } catch (error) {
      if (error?.code === "ENOENT") return DEFAULT_NAME;
      throw new CustomizationError("Could not read the frontend branding settings.", 500);
    }
  }

  async function getBranding() {
    const [name, logoRevision, iconRevision] = await Promise.all([
      readBrandingName(),
      fileRevision(logoFile),
      fileRevision(iconFile),
    ]);
    return {
      name,
      logoUrl: logoRevision ? `/api/custom/branding/logo?v=${logoRevision}` : "",
      iconUrl: iconRevision ? `/api/custom/branding/icon?v=${iconRevision}` : "",
    };
  }

  async function updateBranding(values = {}) {
    const name = typeof values.name === "string" ? values.name.trim() : "";
    if (!name) throw new CustomizationError("Frontend name is required.");
    if (name.length > 60) throw new CustomizationError("Frontend name must be 60 characters or fewer.");
    await atomicWrite(brandingFile, `${JSON.stringify({ name }, null, 2)}\n`);
    return getBranding();
  }

  async function saveBrandAsset(kind, input, contentType) {
    await normalizeImage(input, contentType, brandAssetFile(kind), kind);
    return getBranding();
  }

  async function deleteBrandAsset(kind) {
    await unlink(brandAssetFile(kind)).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
    return getBranding();
  }

  function avatarFile(userId) {
    return path.join(avatarDir, `${validUserId(userId)}.webp`);
  }

  async function getProfile(userId) {
    const id = validUserId(userId);
    const revision = await fileRevision(avatarFile(id));
    return { avatarUrl: revision ? `/api/custom/profile/avatar?v=${revision}` : "" };
  }

  async function saveAvatar(userId, input, contentType) {
    await normalizeImage(input, contentType, avatarFile(userId), "avatar");
    return getProfile(userId);
  }

  async function deleteAvatar(userId) {
    await unlink(avatarFile(userId)).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
    return getProfile(userId);
  }

  async function existingFile(file, message) {
    const info = await stat(file).catch(() => null);
    if (!info?.isFile() || info.size === 0) throw new CustomizationError(message, 404);
    return file;
  }

  return {
    getBranding,
    updateBranding,
    saveBrandAsset,
    deleteBrandAsset,
    getBrandAssetFile: (kind) => existingFile(brandAssetFile(kind), "Branding image not found."),
    getProfile,
    saveAvatar,
    deleteAvatar,
    getAvatarFile: (userId) => existingFile(avatarFile(userId), "Avatar not found."),
    dataDir,
  };
}
