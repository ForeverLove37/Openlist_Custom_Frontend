import {
  Archive,
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Folder,
} from "lucide-react";
import { getFileKind, type FileKind } from "../lib/files";
import type { OpenListItem } from "../lib/types";

const icons: Record<FileKind, typeof File> = {
  folder: Folder,
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  archive: Archive,
  document: FileText,
  file: File,
};

interface FileIconProps {
  item: Pick<OpenListItem, "name" | "is_dir">;
  size?: number;
}

export function FileIcon({ item, size = 22 }: FileIconProps) {
  const kind = getFileKind(item);
  const Icon = icons[kind];
  return <Icon aria-hidden="true" className={`file-icon file-icon--${kind}`} size={size} strokeWidth={1.8} />;
}
