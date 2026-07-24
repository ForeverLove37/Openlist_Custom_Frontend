import type { OpenListItem, SortDirection, SortKey } from "./types";

const IMAGE_EXTENSIONS = new Set([
  "avif", "bmp", "gif", "heic", "heif", "jpeg", "jpg", "png", "svg", "tif", "tiff", "webp",
]);
const VIDEO_EXTENSIONS = new Set([
  "3gp", "avi", "flv", "m2ts", "m4v", "mkv", "mov", "mp4", "mpeg", "mpg", "mts", "ogv", "ts", "webm", "wmv",
]);
const AUDIO_EXTENSIONS = new Set(["aac", "flac", "m4a", "mp3", "ogg", "opus", "wav", "wma"]);
const ARCHIVE_EXTENSIONS = new Set(["7z", "bz2", "gz", "rar", "tar", "tgz", "xz", "zip"]);
const DOCUMENT_EXTENSIONS = new Set(["csv", "doc", "docx", "md", "odt", "pdf", "ppt", "pptx", "rtf", "txt", "xls", "xlsx"]);

export type FileKind = "folder" | "image" | "video" | "audio" | "archive" | "document" | "file";

export function getExtension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > -1 ? name.slice(dot + 1).toLowerCase() : "";
}

export function getFileKind(item: Pick<OpenListItem, "name" | "is_dir">): FileKind {
  if (item.is_dir) return "folder";
  const extension = getExtension(item.name);
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (ARCHIVE_EXTENSIONS.has(extension)) return "archive";
  if (DOCUMENT_EXTENSIONS.has(extension)) return "document";
  return "file";
}

export function joinPath(parent: string, child: string) {
  const cleanParent = parent === "/" ? "" : parent.replace(/\/$/, "");
  return `${cleanParent}/${child}`;
}

export function thumbnailSource(
  item: Pick<OpenListItem, "name" | "is_dir" | "thumb">,
  directoryPath: string,
  customThumbnailsEnabled = true,
) {
  if (item.thumb) return item.thumb;
  const kind = getFileKind(item);
  if (!customThumbnailsEnabled || (kind !== "image" && kind !== "video")) return "";
  const filePath = joinPath(directoryPath, item.name);
  return `/api/custom/thumb?path=${encodeURIComponent(filePath)}&type=${kind}`;
}

export function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return bytes === 0 ? "0 B" : "—";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 || value >= 10 ? 0 : 1)} ${units[index]}`;
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function sortItems(items: OpenListItem[], key: SortKey, direction: SortDirection) {
  const factor = direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    if (key === "size") return (a.size - b.size) * factor;
    if (key === "modified") {
      return (new Date(a.modified).getTime() - new Date(b.modified).getTime()) * factor;
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) * factor;
  });
}

export function directoryPathFromLocation(pathname: string) {
  const raw = pathname.startsWith("/files") ? pathname.slice(6) : "";
  if (!raw || raw === "/") return "/";
  try {
    return `/${raw.split("/").filter(Boolean).map(decodeURIComponent).join("/")}`;
  } catch {
    return "/";
  }
}

export function locationFromDirectoryPath(path: string) {
  if (path === "/") return "/files";
  return `/files/${path.split("/").filter(Boolean).map(encodeURIComponent).join("/")}`;
}
