import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FolderCog,
  Globe2,
  HardDrive,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  X,
} from "lucide-react";
import {
  ApiError,
  createStorage,
  deleteStorage,
  getStorage,
  listStorages,
  setStorageEnabled,
  updateStorage,
} from "../lib/api";
import { emptyStorageForm, storageFromForm, storageStatus, storageToForm } from "../lib/storage";
import type { OpenListStorage, StorageDriver, StorageFormValues } from "../lib/types";

interface StorageManagementProps {
  onStorageChanged: () => void;
}

export function StorageManagement({ onStorageChanged }: StorageManagementProps) {
  const [storages, setStorages] = useState<OpenListStorage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [formStorage, setFormStorage] = useState<OpenListStorage | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<OpenListStorage | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const page = await listStorages(signal);
      setStorages(page.content ?? []);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof ApiError ? reason.message : "Could not load storage settings.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const edit = async (storage: OpenListStorage) => {
    setActionId(storage.id);
    setError("");
    try {
      setFormStorage(await getStorage(storage.id));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Could not load this storage.");
    } finally {
      setActionId(null);
    }
  };

  const toggle = async (storage: OpenListStorage) => {
    setActionId(storage.id);
    setError("");
    setMessage("");
    try {
      await setStorageEnabled(storage.id, storage.disabled);
      setMessage(`${storage.mount_path} is now ${storage.disabled ? "enabled" : "disabled"}.`);
      await load();
      onStorageChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Could not change the storage state.");
    } finally {
      setActionId(null);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setActionId(deleteTarget.id);
    setError("");
    try {
      await deleteStorage(deleteTarget.id);
      setMessage(`${deleteTarget.mount_path} was deleted.`);
      setDeleteTarget(null);
      await load();
      onStorageChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Could not delete this storage.");
    } finally {
      setActionId(null);
    }
  };

  const save = async (values: StorageFormValues) => {
    const existing = formStorage ?? undefined;
    const payload = storageFromForm(values, existing);
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (existing) await updateStorage(payload);
      else await createStorage(payload);
      setFormStorage(undefined);
      setMessage(`${payload.mount_path} was ${existing ? "updated" : "added"}.`);
      await load();
      onStorageChanged();
    } catch (reason) {
      if (!existing && reason instanceof ApiError && hasCreatedStorageId(reason.data)) {
        setFormStorage(undefined);
        setError(`Storage was saved but could not connect: ${reason.message}`);
        await load();
        onStorageChanged();
      } else {
        throw reason;
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-section" aria-labelledby="storage-title">
      <div className="admin-heading">
        <div>
          <p className="admin-eyebrow">Administration</p>
          <h1 id="storage-title">Storage management</h1>
          <p>{loading ? "Loading storage connections" : `${storages.length} ${storages.length === 1 ? "storage" : "storages"} configured`}</p>
        </div>
        <div className="admin-heading__actions">
          <button className="icon-button bordered-button" onClick={() => void load()} disabled={loading} title="Refresh storages">
            <RefreshCw className={loading ? "spin" : ""} size={18} />
          </button>
          <button className="primary-button" onClick={() => setFormStorage(null)}><Plus size={18} /> Add storage</button>
        </div>
      </div>

      {message && <div className="admin-banner admin-banner--success" role="status"><CheckCircle2 size={19} /><span>{message}</span><button onClick={() => setMessage("")} title="Dismiss"><X size={17} /></button></div>}
      {error && <div className="admin-banner admin-banner--error" role="alert"><AlertCircle size={19} /><span>{error}</span><button onClick={() => setError("")} title="Dismiss"><X size={17} /></button></div>}

      {loading && storages.length === 0 ? (
        <StorageLoading />
      ) : storages.length === 0 && !error ? (
        <div className="storage-empty">
          <Database size={38} />
          <h2>No storage connected</h2>
          <p>Add a Local or WebDAV storage to make files available in My files.</p>
          <button className="primary-button" onClick={() => setFormStorage(null)}><Plus size={18} /> Add storage</button>
        </div>
      ) : (
        <div className="storage-list">
          <div className="storage-list__header" aria-hidden="true">
            <span>Mount path</span><span>Driver</span><span>Status</span><span>Order</span><span>Actions</span>
          </div>
          {storages.map((storage) => {
            const status = storageStatus(storage);
            const busy = actionId === storage.id;
            const supported = storage.driver === "Local" || storage.driver === "WebDav" || storage.driver === "OpenList" || storage.driver === "AList V3";
            const remote = storage.driver === "OpenList" || storage.driver === "AList V3";
            return (
              <article className="storage-row" key={storage.id}>
                <div className="storage-identity">
                  <span className={`storage-driver-icon storage-driver-icon--${remote ? "remote" : storage.driver === "WebDav" ? "webdav" : "local"}`}>
                    {remote ? <Server size={21} /> : storage.driver === "WebDav" ? <Globe2 size={21} /> : <HardDrive size={21} />}
                  </span>
                  <span><strong>{storage.mount_path}</strong>{storage.remark && <small>{storage.remark}</small>}</span>
                </div>
                <div className="storage-cell" data-label="Driver"><span>{storage.driver}</span></div>
                <div className="storage-cell storage-status-cell" data-label="Status">
                  <span className={`status-badge status-badge--${status.tone}`}>{status.label}</span>
                  {status.tone === "danger" && <small title={storage.status}>{storage.status}</small>}
                </div>
                <div className="storage-cell" data-label="Order"><span>{storage.order}</span></div>
                <div className="storage-actions">
                  <label className="switch-control" title={storage.disabled ? "Enable storage" : "Disable storage"}>
                    <input type="checkbox" checked={!storage.disabled} disabled={busy} onChange={() => void toggle(storage)} />
                    <span aria-hidden="true" />
                    <span className="sr-only">{storage.disabled ? "Enable" : "Disable"} {storage.mount_path}</span>
                  </label>
                  <button className="icon-button subtle-button" onClick={() => void edit(storage)} disabled={busy || !supported} title={supported ? `Edit ${storage.mount_path}` : `${storage.driver} editing is not supported here`}>
                    {busy ? <LoaderCircle className="spin" size={18} /> : <Pencil size={18} />}
                  </button>
                  <button className="icon-button danger-button" onClick={() => setDeleteTarget(storage)} disabled={busy} title={`Delete ${storage.mount_path}`}><Trash2 size={18} /></button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {formStorage !== undefined && (
        <StorageForm
          existing={formStorage ?? undefined}
          saving={saving}
          onClose={() => setFormStorage(undefined)}
          onSave={save}
        />
      )}
      {deleteTarget && (
        <ConfirmDeleteDialog
          storage={deleteTarget}
          busy={actionId === deleteTarget.id}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void remove()}
        />
      )}
    </section>
  );
}

interface StorageFormProps {
  existing?: OpenListStorage;
  saving: boolean;
  onClose: () => void;
  onSave: (values: StorageFormValues) => Promise<void>;
}

export function StorageForm({ existing, saving, onClose, onSave }: StorageFormProps) {
  const [values, setValues] = useState<StorageFormValues>(() => existing ? storageToForm(existing) : emptyStorageForm());
  const [error, setError] = useState("");
  const editing = Boolean(existing);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, saving]);

  const set = <K extends keyof StorageFormValues>(key: K, value: StorageFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const selectDriver = (driver: StorageDriver) => {
    if (editing) return;
    setValues((current) => ({ ...emptyStorageForm(driver), mountPath: current.mountPath, order: current.order, remark: current.remark }));
    setError("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateStorage(values);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    try {
      await onSave(values);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Could not save this storage.");
    }
  };

  const isLocal = values.driver === "Local";
  const isRemote = values.driver === "OpenList" || values.driver === "AList V3";
  return (
    <div className="dialog-backdrop storage-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="storage-dialog" role="dialog" aria-modal="true" aria-labelledby="storage-form-title">
        <header className="storage-dialog__header">
          <div><span className="dialog__icon"><FolderCog size={24} /></span><div><h2 id="storage-form-title">{editing ? "Edit storage" : "Add storage"}</h2><p>{editing ? existing?.mount_path : "Connect a storage provider"}</p></div></div>
          <button className="icon-button" onClick={onClose} disabled={saving} title="Close"><X size={21} /></button>
        </header>
        <form className="storage-form" onSubmit={(event) => void submit(event)}>
          <fieldset className="driver-options" disabled={editing || saving}>
            <legend>Driver</legend>
            <button type="button" className={isLocal ? "active" : ""} onClick={() => selectDriver("Local")} aria-pressed={isLocal}><HardDrive size={21} /><span><strong>Local</strong><small>Container filesystem</small></span></button>
            <button type="button" className={values.driver === "WebDav" ? "active" : ""} onClick={() => selectDriver("WebDav")} aria-pressed={values.driver === "WebDav"}><Globe2 size={21} /><span><strong>WebDAV</strong><small>Remote server</small></span></button>
            <button type="button" className={values.driver === "OpenList" ? "active" : ""} onClick={() => selectDriver("OpenList")} aria-pressed={values.driver === "OpenList"}><Server size={21} /><span><strong>OpenList</strong><small>Remote OpenList v4</small></span></button>
            <button type="button" className={values.driver === "AList V3" ? "active" : ""} onClick={() => selectDriver("AList V3")} aria-pressed={values.driver === "AList V3"}><Server size={21} /><span><strong>AList V3</strong><small>Remote AList v3</small></span></button>
          </fieldset>

          <div className="form-section">
            <h3>Mount settings</h3>
            <div className="form-grid">
              <label className="form-field form-field--wide"><span>Mount path <b>*</b></span><input required placeholder="/My Drive" value={values.mountPath} onChange={(event) => set("mountPath", event.target.value)} /></label>
              <label className="form-field"><span>Order</span><input type="number" value={values.order} onChange={(event) => set("order", Number(event.target.value))} /></label>
              <label className="form-field"><span>Remark</span><input value={values.remark} onChange={(event) => set("remark", event.target.value)} /></label>
            </div>
          </div>

          <div className="form-section">
            <h3>{isLocal ? "Local connection" : isRemote ? `${values.driver} connection` : "WebDAV connection"}</h3>
            {isLocal ? (
              <div className="form-grid">
                <label className="form-field form-field--wide"><span>Root folder path in container <b>*</b></span><input required placeholder="/data" value={values.rootFolderPath} onChange={(event) => set("rootFolderPath", event.target.value)} /></label>
                <label className="check-field"><input type="checkbox" checked={values.thumbnail} onChange={(event) => set("thumbnail", event.target.checked)} /><span>Generate media thumbnails</span></label>
                <label className="check-field"><input type="checkbox" checked={values.showHidden} onChange={(event) => set("showHidden", event.target.checked)} /><span>Show hidden files</span></label>
              </div>
            ) : values.driver === "WebDav" ? (
              <div className="form-grid">
                <label className="form-field form-field--wide"><span>WebDAV URL <b>*</b></span><input required type="url" placeholder="https://dav.example.com/remote.php/dav/files/user" value={values.address} onChange={(event) => set("address", event.target.value)} /></label>
                <label className="form-field"><span>Username <b>*</b></span><input required autoComplete="username" value={values.username} onChange={(event) => set("username", event.target.value)} /></label>
                <label className="form-field"><span>Password <b>*</b></span><input required type="password" autoComplete="new-password" value={values.password} onChange={(event) => set("password", event.target.value)} /></label>
                <label className="form-field form-field--wide"><span>Remote root folder <b>*</b></span><input required placeholder="/" value={values.rootFolderPath} onChange={(event) => set("rootFolderPath", event.target.value)} /></label>
                <label className="check-field check-field--warning"><input type="checkbox" checked={values.tlsInsecureSkipVerify} onChange={(event) => set("tlsInsecureSkipVerify", event.target.checked)} /><span>Allow an unverified TLS certificate</span></label>
              </div>
            ) : (
              <div className="form-grid">
                <label className="form-field form-field--wide"><span>Remote URL <b>*</b></span><input required type="url" placeholder="https://openlist.example.com" value={values.address} onChange={(event) => set("address", event.target.value)} /></label>
                <label className="form-field form-field--wide"><span>Authentication token <b>*</b></span><input required type="password" autoComplete="new-password" value={values.token} onChange={(event) => set("token", event.target.value)} /></label>
                <label className="form-field form-field--wide"><span>Remote root folder</span><input required placeholder="/" value={values.rootFolderPath} onChange={(event) => set("rootFolderPath", event.target.value)} /></label>
              </div>
            )}
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}
          <footer className="storage-dialog__footer">
            <button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="primary-button" type="submit" disabled={saving}>{saving && <LoaderCircle className="spin" size={17} />}{editing ? "Save changes" : "Add storage"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function ConfirmDeleteDialog({ storage, busy, onCancel, onConfirm }: { storage: OpenListStorage; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
      <section className="dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-storage-title">
        <div className="dialog__icon dialog__icon--danger"><Trash2 size={23} /></div>
        <h2 id="delete-storage-title">Delete storage?</h2>
        <p><strong>{storage.mount_path}</strong> will be removed from OpenList. Files at the source are not deleted.</p>
        <div className="confirm-dialog__actions"><button className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button><button className="delete-button" onClick={onConfirm} disabled={busy}>{busy && <LoaderCircle className="spin" size={17} />} Delete storage</button></div>
      </section>
    </div>
  );
}

function StorageLoading() {
  return <div className="storage-list storage-list--loading" aria-label="Loading storages">{Array.from({ length: 3 }, (_, index) => <div className="storage-row" key={index}><span className="skeleton storage-loading-icon" /><span className="skeleton storage-loading-line" /></div>)}</div>;
}

function validateStorage(values: StorageFormValues) {
  if (!values.mountPath.trim()) return "Mount path is required.";
  if (!values.rootFolderPath.trim()) return "Root folder path is required.";
  if (values.driver === "Local" && !values.rootFolderPath.trim().startsWith("/")) return "Local root folder must be an absolute container path.";
  if (values.driver === "WebDav") {
    if (!values.address.trim() || !values.username.trim() || !values.password) return "WebDAV URL, username, and password are required.";
    try {
      const url = new URL(values.address);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "WebDAV URL must use HTTP or HTTPS.";
    } catch {
      return "Enter a valid WebDAV URL.";
    }
  }
  if (values.driver === "OpenList" || values.driver === "AList V3") {
    if (!values.address.trim() || !values.token.trim()) return "Remote URL and authentication token are required.";
    try {
      const url = new URL(values.address);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "Remote URL must use HTTP or HTTPS.";
    } catch {
      return "Enter a valid remote URL.";
    }
  }
  return "";
}

function hasCreatedStorageId(data: unknown): data is { id: number } {
  return Boolean(data && typeof data === "object" && "id" in data && typeof (data as { id?: unknown }).id === "number");
}
