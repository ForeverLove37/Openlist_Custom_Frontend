import { useEffect, useState, type DragEvent } from "react";
import { FolderOpen, UploadCloud, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDialogAnimation } from "../hooks/useDialogAnimation";

interface UploadDialogProps {
  path: string;
  onClose: () => void;
  onFiles: (files: FileList) => void;
  onBrowse: () => void;
}

export function UploadDialog({ path, onClose, onFiles, onBrowse }: UploadDialogProps) {
  const { t } = useTranslation();
  const { closing, close } = useDialogAnimation(onClose);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close]);

  const hasFiles = (event: DragEvent<HTMLElement>) => Array.from(event.dataTransfer.types).includes("Files");
  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  };
  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  };
  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false);
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (event.dataTransfer.files.length > 0) onFiles(event.dataTransfer.files);
  };

  return (
    <div className={`dialog-backdrop upload-dialog-backdrop${closing ? " is-closing" : ""}`} role="presentation">
      <section className="dialog upload-dialog" role="dialog" aria-modal="true" aria-labelledby="upload-dialog-title">
        <header className="upload-dialog__header">
          <div className="dialog__icon"><UploadCloud size={23} /></div>
          <div>
            <h2 id="upload-dialog-title">{t("upload.title")}</h2>
            <p className="upload-dialog__path">{path}</p>
          </div>
          <button className="icon-button" onClick={close} disabled={closing} title={t("common.close")} aria-label={t("common.close")}><X size={20} /></button>
        </header>
        <p className="upload-dialog__description">{t("upload.description", { path })}</p>
        <div
          className={`upload-drop-zone${dragActive ? " upload-drop-zone--active" : ""}`}
          role="region"
          aria-label={t("upload.dropHint")}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <span className="upload-drop-zone__icon"><UploadCloud size={34} /></span>
          <strong>{dragActive ? t("upload.dropActive") : t("upload.dropHint")}</strong>
          <small>{t("upload.dropSupport")}</small>
        </div>
        <div className="upload-dialog__actions">
          <button className="primary-button" type="button" onClick={onBrowse}><FolderOpen size={17} />{t("upload.chooseFiles")}</button>
          <button className="secondary-button" type="button" onClick={close} disabled={closing}>{t("common.cancel")}</button>
        </div>
      </section>
    </div>
  );
}
