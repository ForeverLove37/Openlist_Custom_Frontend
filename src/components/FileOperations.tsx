import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckSquare2,
  Copy,
  Folder,
  FolderInput,
  Link2,
  LoaderCircle,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { ApiError, listDirectory } from "../lib/api";
import { destinationError, joinPath } from "../lib/files";
import type { OpenListItem } from "../lib/types";

export type FileOperation = "rename" | "copy" | "move" | "delete" | "copyLink";

export interface FileOperationPermissions {
  rename: boolean;
  copy: boolean;
  move: boolean;
  delete: boolean;
  copyLink?: boolean;
}

interface SelectionBarProps {
  count: number;
  permissions: FileOperationPermissions;
  canCopyLink?: boolean;
  onAction: (operation: FileOperation) => void;
  onClear: () => void;
}

export function FileSelectionBar({ count, permissions, canCopyLink = false, onAction, onClear }: SelectionBarProps) {
  if (count === 0) return null;
  return (
    <div className="file-selection-bar" role="toolbar" aria-label="Selected file actions">
      <span><CheckSquare2 size={18} /><strong>{count}</strong> selected</span>
      <div>
        {permissions.rename && count === 1 && <button onClick={() => onAction("rename")}><Pencil size={16} /> Rename</button>}
        {permissions.copy && <button onClick={() => onAction("copy")}><Copy size={16} /> Copy</button>}
        {permissions.move && <button onClick={() => onAction("move")}><FolderInput size={16} /> Move</button>}
        {permissions.copyLink && canCopyLink && <button onClick={() => onAction("copyLink")}><Link2 size={16} /> Copy link</button>}
        {permissions.delete && <button className="file-selection-bar__danger" onClick={() => onAction("delete")}><Trash2 size={16} /> Delete</button>}
        <button className="file-selection-bar__clear" onClick={onClear} title="Clear selection"><X size={17} /><span className="sr-only">Clear selection</span></button>
      </div>
    </div>
  );
}

interface ActionMenuProps {
  point: { x: number; y: number };
  count: number;
  permissions: FileOperationPermissions;
  canCopyLink?: boolean;
  onAction: (operation: FileOperation) => void;
  onClose: () => void;
}

export function FileActionMenu({ point, count, permissions, canCopyLink = false, onAction, onClose }: ActionMenuProps) {
  useEscape(onClose);
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [onClose]);
  const left = Math.max(8, Math.min(point.x, window.innerWidth - 190));
  const top = Math.max(8, Math.min(point.y, window.innerHeight - 250));
  const action = (operation: FileOperation) => { onClose(); onAction(operation); };
  return (
    <div className="file-menu-backdrop" role="presentation" onMouseDown={onClose} onContextMenu={(event) => { event.preventDefault(); onClose(); }}>
      <div className="file-action-menu" role="menu" style={{ left, top }} onMouseDown={(event) => event.stopPropagation()}>
        {permissions.rename && count === 1 && <button role="menuitem" onClick={() => action("rename")}><Pencil size={16} /> Rename</button>}
        {permissions.copy && <button role="menuitem" onClick={() => action("copy")}><Copy size={16} /> Copy {count > 1 ? `${count} items` : ""}</button>}
        {permissions.move && <button role="menuitem" onClick={() => action("move")}><FolderInput size={16} /> Move {count > 1 ? `${count} items` : ""}</button>}
        {permissions.copyLink && canCopyLink && <button role="menuitem" onClick={() => action("copyLink")}><Link2 size={16} /> Copy link</button>}
        {permissions.delete && <button className="danger-button" role="menuitem" onClick={() => action("delete")}><Trash2 size={16} /> Delete {count > 1 ? `${count} items` : ""}</button>}
      </div>
    </div>
  );
}

interface RenameDialogProps {
  item: OpenListItem;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

export function RenameDialog({ item, busy, error, onClose, onSubmit }: RenameDialogProps) {
  const [name, setName] = useState(item.name);
  useEscape(busy ? () => {} : onClose);
  const invalid = !name.trim() || name.trim() === "." || name.trim() === ".." || /[\\/]/.test(name);
  return (
    <DialogFrame title="Rename item" icon={<Pencil size={22} />} onClose={busy ? undefined : onClose}>
      <p>Enter a new name for <strong>{item.name}</strong>.</p>
      <form onSubmit={(event) => { event.preventDefault(); if (!invalid) onSubmit(name.trim()); }}>
        <label>New name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
        {invalid && <div className="form-error">Names cannot be empty or contain slashes.</div>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="file-dialog__actions"><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={busy || invalid || name.trim() === item.name}>{busy && <LoaderCircle className="spin" size={16} />} Rename</button></div>
      </form>
    </DialogFrame>
  );
}

interface DeleteDialogProps {
  items: OpenListItem[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteDialog({ items, busy, error, onClose, onConfirm }: DeleteDialogProps) {
  useEscape(busy ? () => {} : onClose);
  return (
    <DialogFrame title={`Delete ${items.length === 1 ? "item" : `${items.length} items`}`} icon={<Trash2 size={22} />} danger onClose={busy ? undefined : onClose}>
      <p>{items.length === 1 ? <>Permanently delete <strong>{items[0].name}</strong>?</> : "The selected files and folders will be permanently deleted."}</p>
      {items.length > 1 && <ul className="file-dialog__summary">{items.slice(0, 5).map((item) => <li key={item.name}>{item.name}</li>)}{items.length > 5 && <li>and {items.length - 5} more</li>}</ul>}
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="file-dialog__actions"><button className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary-button destructive-primary" disabled={busy} onClick={onConfirm}>{busy && <LoaderCircle className="spin" size={16} />} Delete</button></div>
    </DialogFrame>
  );
}

interface FolderPickerDialogProps {
  operation: "copy" | "move";
  sourcePath: string;
  items: OpenListItem[];
  passwords: Record<string, string>;
  busy: boolean;
  operationError: string;
  onClose: () => void;
  onConfirm: (destination: string) => void;
}

export function FolderPickerDialog({ operation, sourcePath, items, passwords, busy, operationError, onClose, onConfirm }: FolderPickerDialogProps) {
  const [path, setPath] = useState(sourcePath);
  const [folders, setFolders] = useState<OpenListItem[]>([]);
  const [writable, setWritable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  useEscape(busy ? () => {} : onClose);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    listDirectory(path, passwords[path] ?? "", controller.signal)
      .then((data) => {
        setFolders((data.content ?? []).filter((item) => item.is_dir).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
        setWritable(data.write);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setFolders([]);
        setWritable(false);
        setLoadError(reason instanceof ApiError ? reason.message : "Could not load this folder.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [passwords, path]);

  const parts = useMemo(() => path.split("/").filter(Boolean), [path]);
  const invalidDestination = destinationError(sourcePath, items, path);
  const title = operation === "copy" ? "Copy to folder" : "Move to folder";
  return (
    <DialogFrame title={title} icon={operation === "copy" ? <Copy size={22} /> : <FolderInput size={22} />} wide onClose={busy ? undefined : onClose}>
      <p>Choose the destination for {items.length === 1 ? <strong>{items[0].name}</strong> : `${items.length} selected items`}.</p>
      <nav className="folder-picker__breadcrumbs" aria-label="Destination path">
        <button onClick={() => setPath("/")} title="Root"><Folder size={16} /> Root</button>
        {parts.map((part, index) => {
          const destination = `/${parts.slice(0, index + 1).join("/")}`;
          return <span key={destination}>/ <button onClick={() => setPath(destination)}>{part}</button></span>;
        })}
      </nav>
      <div className="folder-picker" role="listbox" aria-label="Folders">
        {path !== "/" && <button className="folder-picker__row" onClick={() => setPath(path.slice(0, path.lastIndexOf("/")) || "/")}><ArrowLeft size={18} /><span>Parent folder</span></button>}
        {loading ? <div className="folder-picker__status"><LoaderCircle className="spin" size={20} /> Loading folders</div> : loadError ? <div className="folder-picker__status folder-picker__status--error">{loadError}</div> : folders.length ? folders.map((folder) => <button className="folder-picker__row" key={folder.name} onClick={() => setPath(joinPath(path, folder.name))}><Folder size={19} /><span>{folder.name}</span></button>) : <div className="folder-picker__status">No subfolders</div>}
      </div>
      <div className="folder-picker__destination"><span>Destination</span><strong>{path}</strong></div>
      {!loading && !loadError && !writable && <div className="form-error">You cannot write to this destination.</div>}
      {invalidDestination && <div className="form-error">{invalidDestination}</div>}
      {operationError && <div className="form-error" role="alert">{operationError}</div>}
      <div className="file-dialog__actions"><button className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy || loading || Boolean(loadError) || !writable || Boolean(invalidDestination)} onClick={() => onConfirm(path)}>{busy && <LoaderCircle className="spin" size={16} />} {operation === "copy" ? "Copy here" : "Move here"}</button></div>
    </DialogFrame>
  );
}

function DialogFrame({ title, icon, danger = false, wide = false, onClose, children }: { title: string; icon: React.ReactNode; danger?: boolean; wide?: boolean; onClose?: () => void; children: React.ReactNode }) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (onClose && event.target === event.currentTarget) onClose(); }}>
      <section className={`dialog file-dialog${wide ? " file-dialog--wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="file-dialog-title">
        {onClose && <button className="icon-button dialog__close" onClick={onClose} title="Close"><X size={20} /></button>}
        <div className={`dialog__icon${danger ? " dialog__icon--danger" : ""}`}>{icon}</div>
        <h2 id="file-dialog-title">{title}</h2>
        {children}
      </section>
    </div>
  );
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);
}
