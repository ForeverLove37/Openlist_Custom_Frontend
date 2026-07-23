import { CheckCircle2, CircleAlert, LoaderCircle, Trash2, UploadCloud, X } from "lucide-react";
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
  if (uploads.length === 0) return null;
  const active = uploads.filter((upload) => upload.status === "uploading").length;
  const completed = uploads.length - active;
  return (
    <aside className="upload-queue" aria-live="polite" aria-label="Upload manager">
      <header className="upload-queue__header"><span><UploadCloud size={19} /><strong>{active ? `Uploading ${active} ${active === 1 ? "file" : "files"}` : "Uploads complete"}</strong></span>{completed > 0 && <button className="icon-button" onClick={onClearCompleted} title="Clear completed uploads"><Trash2 size={17} /></button>}</header>
      <div className="upload-queue__items">
        {uploads.map((upload) => (
          <article className="upload-item" key={upload.id}>
            <div className="upload-item__top">
              <span className={`upload-item__status upload-item__status--${upload.status}`}>{upload.status === "uploading" ? <LoaderCircle className="spin" size={17} /> : upload.status === "success" ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}</span>
              <span className="upload-item__name"><strong title={upload.name}>{upload.name}</strong><small>{upload.status === "uploading" ? `${upload.progress}% of ${formatSize(upload.size)}` : upload.status === "success" ? "Uploaded" : upload.error || (upload.status === "cancelled" ? "Cancelled" : "Upload failed")}</small></span>
              {upload.status === "uploading" ? <button className="icon-button" onClick={() => onCancel(upload.id)} title={`Cancel ${upload.name}`}><X size={17} /></button> : <button className="icon-button" onClick={() => onDismiss(upload.id)} title={`Dismiss ${upload.name}`}><X size={17} /></button>}
            </div>
            {upload.status === "uploading" && <div className="upload-progress" aria-label={`${upload.name} ${upload.progress}% complete`}><span style={{ width: `${upload.progress}%` }} /></div>}
          </article>
        ))}
      </div>
    </aside>
  );
}
