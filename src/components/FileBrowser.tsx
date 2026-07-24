import { Download, ImageOff, MoreHorizontal } from "lucide-react";
import { FileIcon } from "./FileIcon";
import { formatDate, formatSize, getFileKind, thumbnailSource } from "../lib/files";
import type { OpenListItem, ViewMode } from "../lib/types";

interface FileBrowserProps {
  items: OpenListItem[];
  view: ViewMode;
  loading: boolean;
  directoryPath: string;
  customThumbnailsEnabled: boolean;
  onOpen: (item: OpenListItem) => void;
  onDownload: (item: OpenListItem) => void;
  canManage: boolean;
  selectedNames: ReadonlySet<string>;
  onToggleSelection: (item: OpenListItem) => void;
  onToggleAll: () => void;
  onOpenActions: (item: OpenListItem, point: { x: number; y: number }) => void;
}

function LoadingGrid({ view }: { view: ViewMode }) {
  return (
    <div className={view === "grid" ? "file-grid" : "loading-list"} aria-label="Loading files">
      {Array.from({ length: view === "grid" ? 10 : 7 }, (_, index) => (
        <div className={view === "grid" ? "file-card file-card--loading" : "loading-row"} key={index}>
          <span className="skeleton skeleton--media" />
          <span className="skeleton skeleton--line" />
        </div>
      ))}
    </div>
  );
}

export function FileBrowser({
  items,
  view,
  loading,
  directoryPath,
  customThumbnailsEnabled,
  onOpen,
  onDownload,
  canManage,
  selectedNames,
  onToggleSelection,
  onToggleAll,
  onOpenActions,
}: FileBrowserProps) {
  if (loading) return <LoadingGrid view={view} />;

  const allSelected = items.length > 0 && items.every((item) => selectedNames.has(item.name));
  const openContextMenu = (event: React.MouseEvent, item: OpenListItem) => {
    if (!canManage) return;
    event.preventDefault();
    onOpenActions(item, { x: event.clientX, y: event.clientY });
  };
  const openButtonMenu = (event: React.MouseEvent<HTMLButtonElement>, item: OpenListItem) => {
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    onOpenActions(item, { x: bounds.right - 8, y: bounds.bottom + 4 });
  };

  if (view === "list") {
    return (
      <div className="file-table-wrap">
        <table className="file-table">
          <thead>
            <tr>
              <th>
                <span className="file-table__name-heading">
                  {canManage && <input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label={allSelected ? "Clear file selection" : "Select all visible files"} />}
                  <span>Name</span>
                </span>
              </th>
              <th>Owner</th>
              <th>Last modified</th>
              <th>File size</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const thumbnail = thumbnailSource(item, directoryPath, customThumbnailsEnabled);
              const selected = selectedNames.has(item.name);
              return <tr className={selected ? "file-row--selected" : ""} key={item.name} onContextMenu={(event) => openContextMenu(event, item)}>
                <td>
                  <span className="file-table__name-cell">
                    {canManage && <input type="checkbox" checked={selected} onChange={() => onToggleSelection(item)} aria-label={`Select ${item.name}`} />}
                    <button className="file-name-button" onClick={() => onOpen(item)} title={`Open ${item.name}`}>
                      {thumbnail ? <img className="file-table__thumbnail" src={thumbnail} alt="" loading="lazy" decoding="async" /> : <FileIcon item={item} />}
                      <span>{item.name}</span>
                    </button>
                  </span>
                </td>
                <td className="muted-cell">OpenList</td>
                <td className="muted-cell">{formatDate(item.modified)}</td>
                <td className="muted-cell">{item.is_dir ? "—" : formatSize(item.size)}</td>
                <td>
                  <span className="file-row__actions">
                    {!item.is_dir && <button className="icon-button subtle-button" onClick={() => onDownload(item)} title={`Download ${item.name}`}><Download size={18} /></button>}
                    {canManage && <button className="icon-button subtle-button" onClick={(event) => openButtonMenu(event, item)} title={`Actions for ${item.name}`}><MoreHorizontal size={18} /></button>}
                  </span>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="file-grid">
      {items.map((item) => {
        const kind = getFileKind(item);
        const thumbnail = thumbnailSource(item, directoryPath, customThumbnailsEnabled);
        return (
          <article className={`file-card${canManage ? " file-card--manageable" : ""}${selectedNames.has(item.name) ? " file-card--selected" : ""}`} key={item.name} onContextMenu={(event) => openContextMenu(event, item)}>
            {canManage && <label className="file-card__select" title={`Select ${item.name}`}><input type="checkbox" checked={selectedNames.has(item.name)} onChange={() => onToggleSelection(item)} aria-label={`Select ${item.name}`} /></label>}
            {canManage && <button className="icon-button file-card__more" onClick={(event) => openButtonMenu(event, item)} title={`Actions for ${item.name}`}><MoreHorizontal size={18} /></button>}
            <button className="file-card__open" onClick={() => onOpen(item)} title={`Open ${item.name}`}>
              <span className="file-card__title">
                <FileIcon item={item} size={19} />
                <span>{item.name}</span>
              </span>
              <span className={`file-card__preview file-card__preview--${kind}`}>
                {thumbnail ? (
                  <img src={thumbnail} alt="" loading="lazy" decoding="async" />
                ) : kind === "image" ? (
                  <ImageOff aria-hidden="true" size={38} strokeWidth={1.4} />
                ) : (
                  <FileIcon item={item} size={48} />
                )}
                {kind === "video" && <span className="video-label">VIDEO</span>}
              </span>
            </button>
            <div className="file-card__meta">
              <span>{item.is_dir ? "Folder" : formatSize(item.size)}</span>
              {!item.is_dir && (
                <button className="icon-button subtle-button" onClick={() => onDownload(item)} title={`Download ${item.name}`}>
                  <Download size={17} />
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
