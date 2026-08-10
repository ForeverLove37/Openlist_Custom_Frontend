import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileKey2, Image, LoaderCircle, Package, Play, Rocket, Upload, X } from "lucide-react";
import {
  ApiError,
  getAndroidBuildStatus,
  listAndroidReleases,
  publishAndroidRelease,
  startAndroidBuild,
  uploadAndroidIcon,
} from "../lib/api";
import { validateCustomImage } from "../lib/customization";
import type { AndroidBuildJob, AndroidRelease } from "../lib/types";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function AndroidReleaseManagement() {
  const [releases, setReleases] = useState<AndroidRelease[]>([]);
  const [latestVersion, setLatestVersion] = useState("");
  const [version, setVersion] = useState("");
  const [versionCode, setVersionCode] = useState("");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [job, setJob] = useState<AndroidBuildJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pickerRef = useRef<HTMLInputElement>(null);
  const completedJobRef = useRef("");
  const [iconPreview, setIconPreview] = useState("");

  useEffect(() => {
    if (!iconFile) {
      setIconPreview("");
      return;
    }
    const next = URL.createObjectURL(iconFile);
    setIconPreview(next);
    return () => URL.revokeObjectURL(next);
  }, [iconFile]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const page = await listAndroidReleases(signal);
      setReleases(page.releases ?? []);
      setLatestVersion(page.latestVersion ?? "");
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof ApiError ? reason.message : "Could not load Android releases.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "building")) return;
    const timer = window.setInterval(() => {
      void getAndroidBuildStatus(job.id).then((result) => setJob(result.job)).catch((reason) => setError(reason instanceof ApiError ? reason.message : "Could not read build status."));
    }, 3000);
    return () => window.clearInterval(timer);
  }, [job]);

  useEffect(() => {
    if (!job || completedJobRef.current === job.id || (job.status !== "complete" && job.status !== "failed")) return;
    completedJobRef.current = job.id;
    if (job.status === "complete") {
      setMessage(`${job.version} was built and added to the APK library.`);
      void load();
    } else {
      setError(job.message || "The remote Android build failed.");
    }
  }, [job, load]);

  const selectIcon = (file: File) => {
    const invalid = validateCustomImage(file);
    if (invalid) {
      setError(invalid === "size" ? "Images must be 5 MB or smaller." : "Use a PNG, JPEG, WebP, or GIF image.");
      return;
    }
    setError("");
    setIconFile(file);
  };

  const saveIcon = async () => {
    if (!iconFile) return;
    setBusy(true);
    setError("");
    try {
      await uploadAndroidIcon(iconFile);
      setIconFile(null);
      setMessage("Android app icon saved. The next build will include it.");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Could not save the Android app icon.");
    } finally {
      setBusy(false);
    }
  };

  const build = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await startAndroidBuild({ version: version.trim() || undefined, versionCode: versionCode ? Number(versionCode) : undefined });
      setJob(result.job);
      setMessage("Remote full build queued.");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Could not start the Android build.");
    } finally {
      setBusy(false);
    }
  };

  const publish = async (release: AndroidRelease) => {
    setBusy(true);
    setError("");
    try {
      await publishAndroidRelease(release.version);
      setLatestVersion(release.version);
      setReleases((items) => items.map((item) => ({ ...item, published: item.version === release.version })));
      setMessage(`${release.version} is now the latest published version.`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Could not publish this Android release.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-section android-release-section" aria-labelledby="android-title">
      <div className="admin-heading">
        <div><p className="admin-eyebrow">Administration</p><h1 id="android-title">Android app releases</h1><p>{loading ? "Loading release library" : `${releases.length} APK ${releases.length === 1 ? "version" : "versions"} on the remote builder`}</p></div>
      </div>
      {message && <div className="admin-banner admin-banner--success" role="status"><CheckCircle2 size={19} /><span>{message}</span><button onClick={() => setMessage("")} title="Dismiss"><X size={17} /></button></div>}
      {error && <div className="admin-banner admin-banner--error" role="alert"><span>{error}</span><button onClick={() => setError("")} title="Dismiss"><X size={17} /></button></div>}

      <div className="android-release-grid">
        <section className="android-release-panel">
          <div className="android-release-panel__heading"><span className="dialog__icon"><Package size={21} /></span><div><h2>Build a release</h2><p>Builds run on the dedicated remote Android server.</p></div></div>
          <form className="storage-form" onSubmit={(event) => void build(event)}>
            <label className="form-field"><span>Version name</span><input placeholder="Auto increment (for example 0.1.1)" value={version} onChange={(event) => setVersion(event.target.value)} disabled={busy} /></label>
            <label className="form-field"><span>Version code</span><input inputMode="numeric" placeholder="Auto increment" value={versionCode} onChange={(event) => setVersionCode(event.target.value.replace(/\D/g, ""))} disabled={busy} /></label>
            {job && <div className={`android-build-status android-build-status--${job.status}`} role="status"><LoaderCircle className={job.status === "queued" || job.status === "building" ? "spin" : ""} size={18} /><span><strong>{job.status}</strong> · {job.message}</span></div>}
            <button className="primary-button" type="submit" disabled={busy || Boolean(job && (job.status === "queued" || job.status === "building"))}><Play size={17} /> Start full remote build</button>
          </form>
        </section>

        <section className="android-release-panel">
          <div className="android-release-panel__heading"><span className="dialog__icon"><Image size={21} /></span><div><h2>Application icon</h2><p>PNG, JPEG, WebP, or GIF up to 5 MB. It is injected into the next build.</p></div></div>
          <div className="android-icon-picker">
            <div className="android-icon-preview">{iconPreview ? <img src={iconPreview} alt="Selected Android icon" /> : <FileKey2 size={32} />}</div>
            <input ref={pickerRef} className="file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; if (file) selectIcon(file); event.target.value = ""; }} />
            <button className="secondary-button" type="button" onClick={() => pickerRef.current?.click()} disabled={busy}><Upload size={16} /> {iconFile ? "Replace icon" : "Choose icon"}</button>
            {iconFile && <button className="primary-button" type="button" onClick={() => void saveIcon()} disabled={busy}><Rocket size={16} /> Save icon</button>}
          </div>
        </section>
      </div>

      <section className="android-release-panel android-release-library">
        <div className="android-release-panel__heading"><span className="dialog__icon"><Download size={21} /></span><div><h2>APK release library</h2><p>All APKs are stored together on the remote download server. The selected version is advertised as latest.</p></div></div>
        {loading ? <div className="admin-gate"><LoaderCircle className="spin" size={25} /><span>Loading releases</span></div> : releases.length === 0 ? <div className="storage-empty"><Package size={34} /><h2>No APK releases yet</h2><p>Start a remote build to add the first version.</p></div> : <div className="android-release-list"><div className="android-release-list__header"><span>Version</span><span>Created</span><span>Size</span><span>Actions</span></div>{releases.map((release) => <article className={`android-release-row${release.version === latestVersion ? " android-release-row--latest" : ""}`} key={release.version}><div><strong>{release.version}</strong>{release.version === latestVersion && <small>Latest published</small>}<small>Build {release.versionCode}</small></div><span>{new Date(release.createdAt).toLocaleString()}</span><span>{formatBytes(release.size)}</span><div className="storage-actions"><a className="icon-button subtle-button" href={release.downloadUrl} target="_blank" rel="noreferrer" title={`Download ${release.version}`}><Download size={18} /></a>{release.version !== latestVersion && <button className="primary-button compact-button" onClick={() => void publish(release)} disabled={busy}><Rocket size={15} /> Publish</button>}</div></article>)}</div>}
      </section>
    </section>
  );
}
