import { createHash, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import axios from "axios";
import ffmpeg from "fluent-ffmpeg";
import sharp from "sharp";

const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_QUALITY = 80;
const DEFAULT_FFMPEG_PATH = "/usr/bin/ffmpeg";

export class ThumbnailAccessError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.name = "ThumbnailAccessError";
    this.status = status;
  }
}

export function normalizeOpenListPath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048 || !value.startsWith("/") || value.includes("\0")) {
    throw new ThumbnailAccessError("A valid OpenList path is required.", 400);
  }
  if (value.split("/").includes("..")) throw new ThumbnailAccessError("The thumbnail path is invalid.", 400);
  return path.posix.normalize(value);
}

export function thumbnailCacheKey(userId, filePath, type) {
  return createHash("sha256").update(`v1\0${userId}\0${filePath}\0${type}`).digest("hex");
}

export function fallbackSvg(type) {
  const label = type === "video" ? "VIDEO" : "IMAGE";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250" role="img" aria-label="${label} preview unavailable"><rect width="400" height="250" fill="#eef2f7"/><rect x="137" y="69" width="126" height="112" rx="12" fill="#d9e1ec"/><path d="M157 160l31-34 24 24 16-17 31 27z" fill="#a5b4c7"/><circle cx="222" cy="106" r="11" fill="#a5b4c7"/><text x="200" y="216" text-anchor="middle" fill="#69778c" font-family="Arial, sans-serif" font-size="14" font-weight="700">${label} PREVIEW UNAVAILABLE</text></svg>`;
}

function freshCacheFile(cacheFile, ttlMs) {
  return stat(cacheFile)
    .then((info) => info.size > 0 && Date.now() - info.mtimeMs < ttlMs)
    .catch(() => false);
}

function resolveRawUrl(rawUrl, fallbackBaseUrl) {
  let url;
  try {
    url = new URL(rawUrl, fallbackBaseUrl);
  } catch {
    throw new Error("OpenList returned an invalid raw file URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("OpenList returned an unsupported raw file URL.");
  return url.toString();
}

function thumbnailTransformer() {
  // Calling sharp with no input configures a duplex stream for pipeline().
  return sharp()
    .rotate()
    .resize({ width: THUMBNAIL_WIDTH, height: THUMBNAIL_WIDTH, fit: "inside", withoutEnlargement: true })
    .webp({ quality: THUMBNAIL_QUALITY });
}

function safeFfmpegDetail(lines) {
  return lines
    .slice(-4)
    .join(" ")
    .replace(/https?:\/\/\S+/gi, "[source]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

async function extractVideoFrame(rawUrl, targetFile, ffmpegPath, seekSeconds) {
  ffmpeg.setFfmpegPath(ffmpegPath);
  await new Promise((resolve, reject) => {
    const stderr = [];
    let settled = false;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    const command = ffmpeg(rawUrl)
      .seekInput(seekSeconds)
      .outputOptions(["-frames:v 1"])
      .videoCodec("png")
      .format("image2pipe")
      .on("stderr", (line) => stderr.push(line))
      .on("error", (error) => {
        const detail = safeFfmpegDetail(stderr);
        settle(reject, new Error(`FFmpeg could not extract a frame at ${seekSeconds}s${detail ? `: ${detail}` : ""}`, { cause: error }));
      });
    const frame = command.pipe();
    pipeline(frame, thumbnailTransformer(), createWriteStream(targetFile))
      .then(() => settle(resolve))
      .catch((error) => settle(reject, error));
  });
}

export async function videoFrameToWebp(rawUrl, targetFile, ffmpegPath) {
  try {
    await extractVideoFrame(rawUrl, targetFile, ffmpegPath, 3);
  } catch (firstError) {
    await unlink(targetFile).catch(() => {});
    try {
      await extractVideoFrame(rawUrl, targetFile, ffmpegPath, 0);
    } catch (secondError) {
      throw new AggregateError(
        [firstError, secondError],
        `Video thumbnail extraction failed after retry: ${secondError.message}`,
        { cause: secondError },
      );
    }
  }
}

function sessionPassword(session, filePath) {
  let match = "";
  let matchLength = -1;
  for (const [directory, password] of session.passwords) {
    if ((filePath === directory || filePath.startsWith(`${directory.endsWith("/") ? directory : `${directory}/`}`)) && directory.length > matchLength) {
      match = password;
      matchLength = directory.length;
    }
  }
  return match;
}

export async function cacheVideoSource(source, targetFile, maxBytes) {
  const advertisedLength = Number(source.headers?.["content-length"] || 0);
  if (Number.isFinite(advertisedLength) && advertisedLength > maxBytes) {
    source.data?.destroy?.();
    throw new Error(`Video source exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MB thumbnail limit.`);
  }
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        callback(new Error(`Video source exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MB thumbnail limit.`));
        return;
      }
      callback(null, chunk);
    },
  });
  await pipeline(source.data, limiter, createWriteStream(targetFile, { flags: "wx" }));
  if (bytes === 0) throw new Error("Video source was empty.");
  return bytes;
}

export function createThumbnailService({
  openListBaseUrl = process.env.OPENLIST_API_URL || "http://127.0.0.1:5244",
  cacheDir = process.env.THUMBNAIL_CACHE_DIR || path.resolve(".cache/thumbnails"),
  cacheTtlMs = Number(process.env.THUMBNAIL_CACHE_TTL_MS || 86_400_000),
  sessionTtlMs = Number(process.env.THUMBNAIL_SESSION_TTL_MS || 1_800_000),
  ffmpegPath = process.env.FFMPEG_PATH || DEFAULT_FFMPEG_PATH,
  maxRedirects = Number(process.env.THUMBNAIL_MAX_REDIRECTS || 5),
  maxVideoSourceBytes = Number(process.env.THUMBNAIL_VIDEO_SOURCE_MAX_BYTES || 268_435_456),
  httpClient = axios,
} = {}) {
  const sessions = new Map();
  const inFlight = new Map();
  let lastPrune = 0;

  async function openListRequest(endpoint, options) {
    try {
      return await httpClient.request({
        url: `${openListBaseUrl}/api${endpoint}`,
        timeout: 20_000,
        validateStatus: () => true,
        ...options,
      });
    } catch {
      throw new Error("Could not reach the local OpenList service.");
    }
  }

  async function createSession(authorization, directoryPath = "/", password = "") {
    if (typeof authorization !== "string" || authorization.length > 4096) throw new ThumbnailAccessError("A valid OpenList session is required.");
    const response = await openListRequest("/me", { method: "GET", headers: authorization ? { Authorization: authorization } : {} });
    const user = response.data?.data;
    if (response.status < 200 || response.status >= 300 || response.data?.code !== 200 || !Number.isInteger(user?.id)) {
      throw new ThumbnailAccessError(response.data?.message || "OpenList authentication failed.");
    }
    const id = randomBytes(32).toString("base64url");
    const normalizedDirectory = normalizeOpenListPath(directoryPath);
    sessions.set(id, {
      id,
      userId: user.id,
      role: user.role,
      authorization,
      expiresAt: Date.now() + sessionTtlMs,
      passwords: new Map([[normalizedDirectory, typeof password === "string" ? password : ""]]),
    });
    return { id, userId: user.id, role: user.role };
  }

  function updateSession(id, directoryPath = "/", password = "") {
    const session = getSession(id);
    session.passwords.set(normalizeOpenListPath(directoryPath), typeof password === "string" ? password : "");
    session.expiresAt = Date.now() + sessionTtlMs;
    return session;
  }

  function getSession(id) {
    const session = sessions.get(id);
    if (!session || session.expiresAt <= Date.now()) {
      if (id) sessions.delete(id);
      throw new ThumbnailAccessError("Thumbnail session expired.");
    }
    return session;
  }

  function deleteSession(id) {
    if (id) sessions.delete(id);
  }

  async function fetchRawUrl(session, filePath) {
    const response = await openListRequest("/fs/get", {
      method: "POST",
      headers: session.authorization ? { Authorization: session.authorization } : {},
      data: { path: filePath, password: sessionPassword(session, filePath) },
    });
    if (response.status < 200 || response.status >= 300 || response.data?.code !== 200) {
      throw new ThumbnailAccessError(response.data?.message || "OpenList denied access to this file.", response.data?.code === 403 ? 403 : 401);
    }
    const rawUrl = response.data?.data?.raw_url;
    if (typeof rawUrl !== "string" || rawUrl.length === 0) throw new Error("OpenList did not provide a source file URL.");
    return resolveRawUrl(rawUrl, openListBaseUrl);
  }

  function sourceHeaders(rawUrl, authorization) {
    if (!authorization) return {};
    try {
      return new URL(rawUrl).origin === new URL(openListBaseUrl).origin ? { Authorization: authorization } : {};
    } catch {
      return {};
    }
  }

  async function fetchSource(rawUrl, session) {
    let source;
    try {
      source = await httpClient.get(rawUrl, {
        responseType: "stream",
        timeout: 60_000,
        maxRedirects,
        validateStatus: () => true,
        headers: sourceHeaders(rawUrl, session.authorization),
      });
    } catch {
      throw new Error("Could not fetch the thumbnail source.");
    }
    if (source.status < 200 || source.status >= 300) {
      source.data?.destroy?.();
      throw new Error(`Thumbnail source returned HTTP ${source.status}.`);
    }
    if (!source.data || typeof source.data.pipe !== "function") throw new Error("Thumbnail source did not return a readable stream.");
    return source;
  }

  async function generateThumbnail(session, filePath, type, cacheFile) {
    const rawUrl = await fetchRawUrl(session, filePath);
    const temporaryFile = path.join(cacheDir, `.${path.basename(cacheFile)}-${randomBytes(8).toString("hex")}.tmp`);
    const sourceFile = path.join(cacheDir, `.${path.basename(cacheFile)}-${randomBytes(8).toString("hex")}.source`);
    let source;
    try {
      source = await fetchSource(rawUrl, session);
      if (type === "image") {
        await pipeline(source.data, thumbnailTransformer(), createWriteStream(temporaryFile));
      } else {
        await cacheVideoSource(source, sourceFile, maxVideoSourceBytes);
        source.data.destroy();
        source = undefined;
        await videoFrameToWebp(sourceFile, temporaryFile, ffmpegPath);
      }
      await rename(temporaryFile, cacheFile);
    } catch (error) {
      await unlink(temporaryFile).catch(() => {});
      throw error;
    } finally {
      source?.data?.destroy?.();
      await unlink(sourceFile).catch(() => {});
    }
  }

  async function pruneCache() {
    if (Date.now() - lastPrune < 600_000) return;
    lastPrune = Date.now();
    await mkdir(cacheDir, { recursive: true });
    const entries = await readdir(cacheDir, { withFileTypes: true });
    await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
      const file = path.join(cacheDir, entry.name);
      const info = await stat(file).catch(() => null);
      if (info && Date.now() - info.mtimeMs >= cacheTtlMs) await unlink(file).catch(() => {});
    }));
  }

  async function getThumbnail(session, requestedPath, type) {
    if (type !== "image" && type !== "video") throw new ThumbnailAccessError("The thumbnail type is invalid.", 400);
    const filePath = normalizeOpenListPath(requestedPath);
    await pruneCache();
    await mkdir(cacheDir, { recursive: true });
    const cacheFile = path.join(cacheDir, `${thumbnailCacheKey(session.userId, filePath, type)}.webp`);
    if (await freshCacheFile(cacheFile, cacheTtlMs)) return cacheFile;

    const flightKey = `${session.userId}:${filePath}:${type}`;
    if (!inFlight.has(flightKey)) {
      inFlight.set(flightKey, (async () => {
        if (!await freshCacheFile(cacheFile, cacheTtlMs)) await generateThumbnail(session, filePath, type, cacheFile);
        return cacheFile;
      })().finally(() => inFlight.delete(flightKey)));
    }
    return inFlight.get(flightKey);
  }

  return { createSession, updateSession, getSession, deleteSession, getThumbnail, cacheDir, ffmpegPath, maxRedirects, maxVideoSourceBytes };
}
