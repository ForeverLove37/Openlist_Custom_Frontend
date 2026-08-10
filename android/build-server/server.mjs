import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const port = Number(process.env.PORT || 8091);
const root = process.env.RELEASE_ROOT || "/var/lib/openlist-drive/android/releases";
const configRoot = process.env.CONFIG_ROOT || "/var/lib/openlist-drive/android/config";
const workRoot = process.env.WORK_ROOT || "/var/lib/openlist-drive/android/work";
const gradleCacheRoot = process.env.GRADLE_CACHE_ROOT || "/var/lib/openlist-drive/android/gradle-cache";
const sourceRoot = process.env.SOURCE_ROOT || "";
const sourceRepo = process.env.SOURCE_REPO || "https://github.com/ForeverLove37/Openlist_Custom_Frontend.git";
const sourceRef = process.env.SOURCE_REF || "main";
const builderImage = process.env.BUILDER_IMAGE || "openlist-drive-android-toolchain:latest";
const adminToken = process.env.ADMIN_TOKEN || "";
const maxBody = 6 * 1024 * 1024;
const jobs = new Map();
let buildChain = Promise.resolve();

const metadataFile = path.join(root, "releases.json");
const iconFile = path.join(configRoot, "app-icon");

async function ensureState() {
  await mkdir(root, { recursive: true });
  await mkdir(configRoot, { recursive: true });
  await mkdir(workRoot, { recursive: true });
  await mkdir(gradleCacheRoot, { recursive: true });
  try { await access(metadataFile); } catch { await writeFile(metadataFile, JSON.stringify({ latestVersion: "", releases: [] }, null, 2)); }
}

async function metadata() {
  try {
    const value = JSON.parse(await readFile(metadataFile, "utf8"));
    return { latestVersion: typeof value.latestVersion === "string" ? value.latestVersion : "", releases: Array.isArray(value.releases) ? value.releases : [] };
  } catch { return { latestVersion: "", releases: [] }; }
}

async function saveMetadata(value) {
  const temporary = `${metadataFile}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o640 });
  await rename(temporary, metadataFile);
}

function json(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(payload));
}

function validVersion(value) {
  return typeof value === "string" && /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){0,2}(?:[-+][0-9A-Za-z.-]+)?$/.test(value) && value.length <= 40;
}

function validRef(value) {
  return typeof value === "string" && /^[0-9A-Za-z._/-]{1,120}$/.test(value);
}

function authorized(request) {
  if (!adminToken) return false;
  return request.headers.authorization === `Bearer ${adminToken}`;
}

async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBody) throw Object.assign(new Error("Request body is too large."), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function jsonBody(request) {
  const raw = await body(request);
  try { return raw.length ? JSON.parse(raw.toString("utf8")) : {}; } catch { throw Object.assign(new Error("Request body is invalid."), { status: 400 }); }
}

function isImage(contentType, bytes) {
  return new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]).has(contentType)
    && ((contentType === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      || (contentType === "image/jpeg" && bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
      || (contentType === "image/webp" && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP")
      || (contentType === "image/gif" && (bytes.subarray(0, 6).toString() === "GIF87a" || bytes.subarray(0, 6).toString() === "GIF89a")));
}

async function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function run(command, args, options = {}) {
  return exec(command, args, { timeout: options.timeout || 45 * 60 * 1000, maxBuffer: 2 * 1024 * 1024, ...options });
}

async function prepareSource(directory, ref) {
  if (sourceRoot) {
    await run("tar", ["-C", sourceRoot, "-cf", path.join(directory, "source.tar"), "."]);
    await mkdir(path.join(directory, "source"), { recursive: true });
    await run("tar", ["-C", path.join(directory, "source"), "-xf", path.join(directory, "source.tar")]);
    return path.join(directory, "source");
  }
  const archive = path.join(directory, "source.tar.gz");
  const url = `${sourceRepo.replace(/\.git$/, "")}/archive/refs/heads/${encodeURIComponent(ref).replace(/%2F/g, "/")}.tar.gz`;
  await run("curl", ["-fsSL", "--max-time", "180", url, "-o", archive]);
  await mkdir(path.join(directory, "source"), { recursive: true });
  await run("tar", ["-C", path.join(directory, "source"), "-xzf", archive, "--strip-components=1"]);
  return path.join(directory, "source");
}

async function buildJob(job, values) {
  const directory = path.join(workRoot, job.id);
  await mkdir(directory, { recursive: true });
  try {
    job.status = "building";
    job.message = "Preparing the source tree on the remote builder.";
    const source = await prepareSource(directory, values.ref || sourceRef);
    const icon = await stat(iconFile).catch(() => null);
    const releaseVersion = job.version.replace(/[^0-9A-Za-z.+-]/g, "");
    const releaseCode = String(job.versionCode);
    const driveUrl = values.driveUrl || process.env.DRIVE_URL || "https://drive.erailab.com";
    if (!/^https:\/\//.test(driveUrl)) throw new Error("The Android app URL must use HTTPS.");
    job.message = "Running the full Android release build on the remote server.";
    const dockerArgs = [
      "run", "--rm", "--name", `openlist-drive-android-${job.id}`, "--memory=6g",
      "--env-file", path.join(configRoot, "signing.env"),
      "--env", `ANDROID_BUILD_DRIVE_URL=${driveUrl}`,
      "--env", `ANDROID_RELEASE_VERSION=${releaseVersion}`,
      "--env", `ANDROID_RELEASE_CODE=${releaseCode}`,
      "-v", `${source}:/workspace`,
      "-v", `${directory}:/output`,
      "-v", `${configRoot}:/config`,
      "-v", `${gradleCacheRoot}:/root/.gradle`,
      "-w", "/workspace/android", builderImage, "sh", "-lc",
    ];
    const iconCommand = icon?.isFile()
      ? "convert /config/app-icon -background none -gravity center -resize 432x432 -extent 432x432 app/src/main/res/drawable/app_icon.png && rm -f app/src/main/res/drawable/app_icon.xml && "
      : "";
    const buildCommand = `${iconCommand}test -f /config/release.keystore || keytool -genkeypair -keystore /config/release.keystore -storepass \"$ANDROID_KEYSTORE_PASSWORD\" -keypass \"$ANDROID_KEY_PASSWORD\" -alias \"$ANDROID_KEY_ALIAS\" -keyalg RSA -keysize 4096 -validity 10000 -dname \"CN=OpenList Drive,OU=Android,O=ForeverLove37,L=Unknown,ST=Unknown,C=US\"; gradle --no-daemon --stacktrace assembleRelease -PdriveUrl=\"$ANDROID_BUILD_DRIVE_URL\" -PreleaseVersion=\"$ANDROID_RELEASE_VERSION\" -PreleaseCode=\"$ANDROID_RELEASE_CODE\" && cp app/build/outputs/apk/release/app-release.apk /output/out.apk`;
    await run("docker", [...dockerArgs, buildCommand]);
    const finalName = `openlist-drive-${releaseVersion}.apk`;
    const finalPath = path.join(root, finalName);
    const temporaryRelease = path.join(root, `.${finalName}.${job.id}.tmp`);
    await copyFile(path.join(directory, "out.apk"), temporaryRelease);
    await rename(temporaryRelease, finalPath);
    const info = await stat(finalPath);
    const entry = { version: releaseVersion, versionCode: job.versionCode, filename: finalName, size: info.size, sha256: await sha256(finalPath), createdAt: new Date().toISOString(), published: false };
    const current = await metadata();
    current.releases = [entry, ...current.releases.filter((item) => item.version !== entry.version)];
    await saveMetadata(current);
    job.status = "complete";
    job.message = "APK built and added to the release library.";
    job.release = entry;
  } catch (error) {
    job.status = "failed";
    job.message = error?.stderr?.slice(-2000) || error?.message || "Remote Android build failed.";
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

function enqueue(values) {
  const job = { id: randomUUID(), status: "queued", message: "Waiting for the remote builder.", version: values.version, versionCode: values.versionCode };
  jobs.set(job.id, job);
  buildChain = buildChain.then(() => buildJob(job, values)).catch(() => {});
  return job;
}

async function handler(request, response) {
  const url = new URL(request.url, "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/healthz") return json(response, 200, { ok: true });
  if (request.method === "GET" && (url.pathname === "/api/releases" || url.pathname === "/api/releases/latest")) {
    const current = await metadata();
    if (url.pathname.endsWith("/latest")) {
      const latest = current.releases.find((item) => item.version === current.latestVersion && item.published) || current.releases.find((item) => item.published) || null;
      return json(response, 200, { ok: true, latest });
    }
    return json(response, 200, { ok: true, ...current });
  }
  if (url.pathname.startsWith("/api/admin/") && !authorized(request)) return json(response, 401, { ok: false, message: "Administrator builder authorization required." });
  if (request.method === "PUT" && url.pathname === "/api/admin/icon") {
    const bytes = await body(request);
    const type = String(request.headers["content-type"] || "").split(";", 1)[0];
    if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024 || !isImage(type, bytes)) return json(response, 400, { ok: false, message: "Use a valid PNG, JPEG, WebP, or GIF icon up to 5 MB." });
    await writeFile(iconFile, bytes, { mode: 0o640 });
    return json(response, 200, { ok: true, message: "Android icon updated." });
  }
  if (request.method === "DELETE" && url.pathname === "/api/admin/icon") {
    await rm(iconFile, { force: true });
    return json(response, 200, { ok: true });
  }
  if (request.method === "POST" && url.pathname === "/api/admin/build") {
    const values = await jsonBody(request);
    const current = await metadata();
    const nextCode = Math.max(0, ...current.releases.map((item) => Number(item.versionCode) || 0)) + 1;
    const version = values.version || `0.1.${nextCode}`;
    if (!validVersion(version)) return json(response, 400, { ok: false, message: "Version must be a valid numeric release version." });
    const versionCode = Number.isInteger(values.versionCode) && values.versionCode > 0 ? values.versionCode : nextCode;
    if (!validRef(values.ref || sourceRef)) return json(response, 400, { ok: false, message: "Source ref is invalid." });
    if (current.releases.some((item) => item.version === version)) return json(response, 409, { ok: false, message: "That Android version already exists." });
    return json(response, 202, { ok: true, job: enqueue({ ...values, version, versionCode }) });
  }
  const buildMatch = url.pathname.match(/^\/api\/admin\/build\/([^/]+)$/);
  if (request.method === "GET" && buildMatch) {
    const job = jobs.get(decodeURIComponent(buildMatch[1]));
    return job ? json(response, 200, { ok: true, job }) : json(response, 404, { ok: false, message: "Build job not found." });
  }
  const publishMatch = url.pathname.match(/^\/api\/admin\/releases\/([^/]+)\/publish$/);
  if (request.method === "POST" && publishMatch) {
    const version = decodeURIComponent(publishMatch[1]);
    const current = await metadata();
    if (!current.releases.some((item) => item.version === version)) return json(response, 404, { ok: false, message: "Release not found." });
    current.latestVersion = version;
    current.releases = current.releases.map((item) => ({ ...item, published: item.version === version }));
    await saveMetadata(current);
    return json(response, 200, { ok: true, latest: current.releases.find((item) => item.version === version) });
  }
  return json(response, 404, { ok: false, message: "Not found." });
}

await ensureState();
http.createServer((request, response) => handler(request, response).catch((error) => json(response, error.status || 500, { ok: false, message: error.message || "Builder request failed." }))).listen(port, "0.0.0.0", () => console.log(`Android release service listening on ${port}`));
