import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Globe2, LoaderCircle, Network, RefreshCw, X } from "lucide-react";
import { ApiError, listRemoteStorages, updateRemoteStorageTransferMode } from "../lib/api";
import { storageStatus } from "../lib/storage";
import type { OpenListStorage } from "../lib/types";

export function RemoteStorageManagement({ connection, onClose }: { connection: OpenListStorage; onClose: () => void }) {
  const [storages, setStorages] = useState<OpenListStorage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const page = await listRemoteStorages(connection.id, signal);
      setStorages(page.content ?? []);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof ApiError ? reason.message : "Could not load remote storage settings.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [connection.id]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape" && savingId === null) onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, savingId]);

  const updateMode = async (storage: OpenListStorage, webProxy: boolean, proxyRange = storage.proxy_range) => {
    setSavingId(storage.id);
    setError("");
    setMessage("");
    try {
      const updated = await updateRemoteStorageTransferMode(connection.id, storage.id, webProxy, proxyRange);
      setStorages((current) => current.map((item) => item.id === storage.id ? updated : item));
      setMessage(`${storage.mount_path} now uses ${webProxy ? "Native Proxy" : "302 Redirect"}.`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Could not update the remote transfer mode.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="dialog-backdrop remote-storage-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && savingId === null) onClose(); }}>
      <section className="remote-storage-dialog" role="dialog" aria-modal="true" aria-labelledby="remote-storage-title">
        <header className="storage-dialog__header">
          <div><span className="dialog__icon"><Network size={24} /></span><div><h2 id="remote-storage-title">Remote storage controls</h2><p>{connection.mount_path}</p></div></div>
          <button className="icon-button" onClick={onClose} disabled={savingId !== null} title="Close"><X size={21} /></button>
        </header>
        <div className="remote-storage-content">
          <div className="remote-storage-toolbar">
            <span>{loading ? "Loading remote instance" : `${storages.length} downstream ${storages.length === 1 ? "storage" : "storages"}`}</span>
            <button className="icon-button bordered-button" onClick={() => void load()} disabled={loading} title="Refresh remote storages"><RefreshCw className={loading ? "spin" : ""} size={18} /></button>
          </div>
          {message && <div className="admin-banner admin-banner--success" role="status"><CheckCircle2 size={19} /><span>{message}</span><button onClick={() => setMessage("")} title="Dismiss"><X size={17} /></button></div>}
          {error && <div className="admin-banner admin-banner--error" role="alert"><AlertCircle size={19} /><span>{error}</span><button onClick={() => setError("")} title="Dismiss"><X size={17} /></button></div>}
          {loading && storages.length === 0 ? (
            <div className="admin-gate remote-storage-loading"><LoaderCircle className="spin" size={27} /><span>Loading downstream storage settings</span></div>
          ) : storages.length === 0 && !error ? (
            <div className="storage-empty"><Globe2 size={36} /><h2>No downstream storage</h2><p>The remote OpenList instance has no configured storages.</p></div>
          ) : (
            <div className="remote-storage-list">
              {storages.map((storage) => {
                const status = storageStatus(storage);
                const proxySupported = storage.driver !== "Local";
                const saving = savingId === storage.id;
                return <article className="remote-storage-row" key={storage.id}>
                  <div className="remote-storage-identity"><strong>{storage.mount_path}</strong><span>{storage.driver}</span></div>
                  <span className={`status-badge status-badge--${status.tone}`}>{status.label}</span>
                  {proxySupported ? <div className="transfer-control" aria-label={`Transfer mode for ${storage.mount_path}`}>
                    <button className={storage.web_proxy ? "active" : ""} disabled={saving} onClick={() => void updateMode(storage, true)}>Native Proxy</button>
                    <button className={!storage.web_proxy ? "active" : ""} disabled={saving} onClick={() => void updateMode(storage, false)}>302 Redirect</button>
                  </div> : <span className="remote-storage-local">Local transfer</span>}
                  {proxySupported && storage.web_proxy && <label className="check-field remote-range"><input type="checkbox" checked={storage.proxy_range} disabled={saving} onChange={(event) => void updateMode(storage, true, event.target.checked)} /><span>Proxy range requests</span></label>}
                  {saving && <LoaderCircle className="spin remote-storage-saving" size={18} />}
                </article>;
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
