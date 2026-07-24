import { CheckCircle2, ChevronDown, ChevronUp, CircleAlert, LoaderCircle, Trash2, UploadCloud, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatSize } from "../lib/files";

export type UploadStatus = "uploading" | "success" | "error" | "cancelled";

export interface UploadEntry {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: UploadStatus;
  error?: string;
}

interface UploadQueueProps {
  uploads: UploadEntry[];
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
  onClearCompleted: () => void;
}

export function UploadQueue({ uploads, onCancel, onDismiss, onClearCompleted }: UploadQueueProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  if (uploads.length === 0) return null;
  const active = uploads.filter((upload) => upload.status === "uploading").length;
  const completed = uploads.length - active;
  const progress = active ? Math.round(uploads.filter((upload) => upload.status === "uploading").reduce((total, upload) => total + upload.progress, 0) / active) : 100;
  return (
    <aside className={`upload-queue${collapsed ? " upload-queue--collapsed" : ""}`} aria-live="polite" aria-label="Upload manager">
      <header className="upload-queue__header"><span><span className="upload-queue__indicator" style={{ "--upload-progress": `${progress}%` } as React.CSSProperties}><UploadCloud size={18} /></span><strong>{active ? t("upload.uploading", { count: active }) : t("upload.complete")}</strong></span><div>{completed > 0 && <button className="icon-button" onClick={onClearCompleted} title={t("upload.clearCompleted")}><Trash2 size={17} /></button>}<button className="icon-button" onClick={() => setCollapsed((value) => !value)} title={collapsed ? t("upload.expand") : t("upload.minimize")}>{collapsed ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button></div></header>
      {!collapsed && <div className="upload-queue__items">
        {uploads.map((upload) => (
          <article className="upload-item" key={upload.id}>
            <div className="upload-item__top">
              <span className={`upload-item__status upload-item__status--${upload.status}`}>{upload.status === "uploading" ? <LoaderCircle className="spin" size={17} /> : upload.status === "success" ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}</span>
              <span className="upload-item__name"><strong title={upload.name}>{upload.name}</strong><small>{upload.status === "uploading" ? `${upload.progress}% of ${formatSize(upload.size)}` : upload.status === "success" ? t("upload.uploaded") : upload.error || (upload.status === "cancelled" ? t("upload.cancelled") : t("upload.failed"))}</small></span>
              {upload.status === "uploading" ? <button className="icon-button" onClick={() => onCancel(upload.id)} title={`Cancel ${upload.name}`}><X size={17} /></button> : <button className="icon-button" onClick={() => onDismiss(upload.id)} title={`Dismiss ${upload.name}`}><X size={17} /></button>}
            </div>
            {upload.status === "uploading" && <div className="upload-progress" aria-label={`${upload.name} ${upload.progress}% complete`}><span style={{ width: `${upload.progress}%` }} /></div>}
          </article>
        ))}
      </div>}
    </aside>
  );
}
