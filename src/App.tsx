import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  ArrowDownAZ,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  CircleUserRound,
  Cloud,
  Files,
  FolderOpen,
  Grid2X2,
  HardDrive,
  List,
  LoaderCircle,
  LogIn,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { AdvancedSearch } from "./components/AdvancedSearch";
import { LoginDialog, PasswordDialog } from "./components/Dialogs";
import { FileBrowser } from "./components/FileBrowser";
import {
  DeleteDialog,
  FileActionMenu,
  FileSelectionBar,
  FolderPickerDialog,
  RenameDialog,
  type FileOperation,
  type FileOperationPermissions,
} from "./components/FileOperations";
import { Gallery } from "./components/Gallery";
import { LanguageSelector } from "./components/LanguageSelector";
import { NativeManagement } from "./components/NativeManagement";
import { StorageManagement } from "./components/StorageManagement";
import { UserManagement } from "./components/UserManagement";
import { UploadQueue, type UploadEntry } from "./components/UploadQueue";
import { VideoModal } from "./components/VideoModal";
import {
  ApiError,
  clearThumbnailSession,
  copyEntries,
  getCurrentUser,
  getFile,
  getToken,
  login,
  logout,
  moveEntries,
  removeEntries,
  renameEntry,
  setToken,
  syncThumbnailSession,
  uploadFile,
} from "./lib/api";
import {
  directoryPathFromLocation,
  getFileKind,
  joinPath,
  locationFromDirectoryPath,
  sortItems,
} from "./lib/files";
import type { OpenListItem, OpenListUser, SortDirection, SortKey, ViewMode } from "./lib/types";
import { useDirectory } from "./hooks/useDirectory";

interface VideoSelection { name: string; source: string; poster?: string }
interface GallerySelection { images: OpenListItem[]; index: number }
type AppView = "files" | "storages" | "users" | "native";

const ADMIN_ROLE = 2;

function viewFromLocation(): AppView {
  if (window.location.pathname === "/admin/storages") return "storages";
  if (window.location.pathname === "/admin/users") return "users";
  if (window.location.pathname === "/admin/native") return "native";
  return "files";
}

function isAdminView(view: AppView) {
  return view === "storages" || view === "users" || view === "native";
}

async function copyToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("The browser blocked access to the clipboard.");
}

export default function App() {
  const { t } = useTranslation();
  const [appView, setAppView] = useState<AppView>(viewFromLocation);
  const [currentPath, setCurrentPath] = useState(() => directoryPathFromLocation(window.location.pathname));
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [view, setView] = useState<ViewMode>(() => localStorage.getItem("openlist-drive-view") === "list" ? "list" : "grid");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [gallery, setGallery] = useState<GallerySelection | null>(null);
  const [video, setVideo] = useState<VideoSelection | null>(null);
  const [mediaLoading, setMediaLoading] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"error" | "success">("error");
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [needsOtp, setNeedsOtp] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [user, setUser] = useState<OpenListUser | null>(null);
  const [userResolved, setUserResolved] = useState(false);
  const [thumbnailSessionReady, setThumbnailSessionReady] = useState(false);
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(() => new Set());
  const [actionMenu, setActionMenu] = useState<{ x: number; y: number } | null>(null);
  const [fileOperation, setFileOperation] = useState<FileOperation | null>(null);
  const [operationBusy, setOperationBusy] = useState(false);
  const [operationError, setOperationError] = useState("");
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadControllers = useRef(new Map<string, AbortController>());
  const uploadSequence = useRef(0);
  const currentPathRef = useRef(currentPath);
  const { data, loading, error, refresh } = useDirectory(currentPath, passwords[currentPath] ?? "", appView === "files");

  useEffect(() => { currentPathRef.current = currentPath; }, [currentPath]);
  useEffect(() => {
    setSelectedNames(new Set());
    setActionMenu(null);
    setFileOperation(null);
    setOperationError("");
  }, [currentPath]);
  useEffect(() => () => { uploadControllers.current.forEach((controller) => controller.abort()); }, []);

  const loadUser = useCallback(() => {
    const controller = new AbortController();
    getCurrentUser(controller.signal)
      .then(setUser)
      .catch(() => {
        if (getToken()) setToken("");
        setUser(null);
      })
      .finally(() => { if (!controller.signal.aborted) setUserResolved(true); });
    return () => controller.abort();
  }, []);

  useEffect(loadUser, [loadUser]);

  useEffect(() => {
    if (!userResolved) return;
    let active = true;
    setThumbnailSessionReady(false);
    void syncThumbnailSession(currentPath, passwords[currentPath] ?? "")
      .then(() => { if (active) setThumbnailSessionReady(true); })
      .catch(() => { if (active) setThumbnailSessionReady(false); });
    return () => { active = false; };
  }, [currentPath, passwords, user?.id, userResolved]);

  useEffect(() => {
    const handlePopState = () => {
      setAppView(viewFromLocation());
      setCurrentPath(directoryPathFromLocation(window.location.pathname));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (appView !== "files") return;
    if (error?.status === 401) setLoginOpen(true);
    if (error?.status === 403 && !(passwords[currentPath] ?? "")) setPasswordOpen(true);
  }, [appView, currentPath, error, passwords]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const navigate = useCallback((path: string) => {
    const normalized = path || "/";
    window.history.pushState({}, "", locationFromDirectoryPath(normalized));
    setAppView("files");
    setCurrentPath(normalized);
    setQuery("");
    setAdvancedSearchOpen(false);
    setSidebarOpen(false);
  }, []);

  const navigateToAdmin = useCallback((view: Exclude<AppView, "files">) => {
    const routes: Record<Exclude<AppView, "files">, string> = {
      storages: "/admin/storages",
      users: "/admin/users",
      native: "/admin/native",
    };
    window.history.pushState({}, "", routes[view]);
    setAppView(view);
    setSidebarOpen(false);
  }, []);

  const items = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const filtered = (data.content ?? []).filter((item) => item.name.toLocaleLowerCase().includes(normalizedQuery));
    return sortItems(filtered, sortKey, sortDirection);
  }, [data.content, query, sortDirection, sortKey]);

  const images = useMemo(() => (data.content ?? []).filter((item) => getFileKind(item) === "image"), [data.content]);

  const resolveFile = useCallback(async (item: OpenListItem) => {
    const itemPath = joinPath(currentPath, item.name);
    setMediaLoading(item.name);
    try {
      return await getFile(itemPath, passwords[currentPath] ?? "");
    } catch (reason) {
      setNoticeTone("error");
      setNotice(reason instanceof ApiError ? reason.message : `Could not open ${item.name}.`);
      return null;
    } finally {
      setMediaLoading("");
    }
  }, [currentPath, passwords]);

  const openItem = useCallback(async (item: OpenListItem) => {
    if (item.is_dir) {
      navigate(joinPath(currentPath, item.name));
      return;
    }
    const kind = getFileKind(item);
    if (kind === "image") {
      setGallery({ images, index: Math.max(0, images.findIndex((image) => image.name === item.name)) });
      return;
    }
    const detail = await resolveFile(item);
    if (!detail?.raw_url) return;
    if (kind === "video") {
      setVideo({ name: item.name, source: detail.raw_url, poster: item.thumb || undefined });
      return;
    }
    window.location.assign(detail.raw_url);
  }, [currentPath, images, navigate, resolveFile]);

  const downloadItem = useCallback(async (item: OpenListItem) => {
    const detail = await resolveFile(item);
    if (!detail?.raw_url) return;
    const anchor = document.createElement("a");
    anchor.href = detail.raw_url;
    anchor.download = item.name;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }, [resolveFile]);

  const changeView = (mode: ViewMode) => {
    setView(mode);
    localStorage.setItem("openlist-drive-view", mode);
  };

  const canUpload = !loading && data.write && (user?.role === ADMIN_ROLE || data.write_content_bypass || Boolean(user && (user.permission & (1 << 3))));
  const hasFilePermission = useCallback((bit: number) => user?.role === ADMIN_ROLE || Boolean(user && (user.permission & (1 << bit))), [user]);
  const filePermissions = useMemo<FileOperationPermissions>(() => ({
    rename: Boolean(data.write && hasFilePermission(4)),
    move: Boolean(data.write && hasFilePermission(5)),
    copy: hasFilePermission(6),
    delete: Boolean(data.write && hasFilePermission(7)),
    copyLink: Boolean(data.content),
  }), [data.content, data.write, hasFilePermission]);
  const canManageFiles = filePermissions.rename || filePermissions.copy || filePermissions.move || filePermissions.delete;
  const selectableItems = useMemo(() => items.filter((item) => canManageFiles || (filePermissions.copyLink && !item.is_dir)), [canManageFiles, filePermissions.copyLink, items]);
  const selectedItems = useMemo(() => (data.content ?? []).filter((item) => selectedNames.has(item.name)), [data.content, selectedNames]);

  const toggleSelection = useCallback((item: OpenListItem) => {
    setSelectedNames((current) => {
      const next = new Set(current);
      if (next.has(item.name)) next.delete(item.name);
      else next.add(item.name);
      return next;
    });
    setActionMenu(null);
  }, []);
  const toggleAll = useCallback(() => {
    setSelectedNames((current) => {
      const next = new Set(current);
      const allSelected = selectableItems.length > 0 && selectableItems.every((item) => next.has(item.name));
      for (const item of selectableItems) {
        if (allSelected) next.delete(item.name);
        else next.add(item.name);
      }
      return next;
    });
  }, [selectableItems]);
  const openFileActions = useCallback((item: OpenListItem, point: { x: number; y: number }) => {
    setSelectedNames((current) => current.has(item.name) ? current : new Set([item.name]));
    setActionMenu(point);
  }, []);
  const copyDirectLink = useCallback(async () => {
    const item = selectedItems[0];
    if (!item || item.is_dir || selectedItems.length !== 1) return;
    setOperationBusy(true);
    try {
      const detail = await getFile(joinPath(currentPath, item.name), passwords[currentPath] ?? "");
      if (!detail.raw_url) throw new Error("OpenList did not return a direct file link.");
      await copyToClipboard(detail.raw_url);
      setSelectedNames(new Set());
      setNoticeTone("success");
      setNotice(t("files.linkCopied"));
    } catch (reason) {
      setNoticeTone("error");
      setNotice(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Could not copy the direct link.");
    } finally {
      setOperationBusy(false);
    }
  }, [currentPath, passwords, selectedItems, t]);
  const beginFileOperation = useCallback((operation: FileOperation) => {
    setActionMenu(null);
    setOperationError("");
    if (operation === "copyLink") {
      void copyDirectLink();
      return;
    }
    setFileOperation(operation);
  }, [copyDirectLink]);
  const closeFileOperation = useCallback(() => {
    if (operationBusy) return;
    setFileOperation(null);
    setOperationError("");
  }, [operationBusy]);
  const completeFileOperation = useCallback((message: string) => {
    setFileOperation(null);
    setSelectedNames(new Set());
    setOperationError("");
    setNoticeTone("success");
    setNotice(message);
    refresh();
    window.setTimeout(refresh, 900);
  }, [refresh]);
  const runFileOperation = useCallback(async (operation: FileOperation, value?: string) => {
    if (selectedItems.length === 0) return;
    setOperationBusy(true);
    setOperationError("");
    try {
      const names = selectedItems.map((item) => item.name);
      if (operation === "rename") {
        if (selectedItems.length !== 1 || !value) return;
        await renameEntry(joinPath(currentPath, selectedItems[0].name), value);
        completeFileOperation(`Renamed ${selectedItems[0].name} to ${value}.`);
      } else if (operation === "delete") {
        await removeEntries(currentPath, names);
        completeFileOperation(`Deleted ${names.length} ${names.length === 1 ? "item" : "items"}.`);
      } else if (operation === "copy" && value) {
        await copyEntries(currentPath, value, names);
        completeFileOperation(`Copy ${names.length === 1 ? "operation" : "operations"} started.`);
      } else if (operation === "move" && value) {
        await moveEntries(currentPath, value, names);
        completeFileOperation(`Move ${names.length === 1 ? "operation" : "operations"} started.`);
      }
    } catch (reason) {
      setOperationError(reason instanceof ApiError ? reason.message : `Could not ${operation} the selected ${selectedItems.length === 1 ? "item" : "items"}.`);
    } finally {
      setOperationBusy(false);
    }
  }, [completeFileOperation, currentPath, selectedItems]);
  const updateUpload = useCallback((id: string, update: Partial<UploadEntry>) => {
    setUploads((items) => items.map((item) => item.id === id ? { ...item, ...update } : item));
  }, []);
  const enqueueUploads = useCallback((files: FileList | File[]) => {
    if (!canUpload) return;
    const destination = currentPath;
    const password = passwords[destination] ?? "";
    for (const file of Array.from(files)) {
      if (!file || file.name === "") continue;
      const id = `${Date.now()}-${uploadSequence.current++}`;
      const controller = new AbortController();
      uploadControllers.current.set(id, controller);
      setUploads((items) => [...items, { id, name: file.name, size: file.size, progress: 0, status: "uploading" }]);
      void uploadFile(file, joinPath(destination, file.name), {
        password,
        signal: controller.signal,
        onProgress: (progress) => updateUpload(id, { progress }),
      }).then(() => {
        updateUpload(id, { progress: 100, status: "success" });
        if (currentPathRef.current === destination) refresh();
      }).catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          updateUpload(id, { status: "cancelled" });
        } else {
          updateUpload(id, { status: "error", error: reason instanceof ApiError ? reason.message : "Upload failed." });
        }
      }).finally(() => uploadControllers.current.delete(id));
    }
  }, [canUpload, currentPath, passwords, refresh, updateUpload]);
  const cancelUpload = useCallback((id: string) => uploadControllers.current.get(id)?.abort(), []);
  const dismissUpload = useCallback((id: string) => setUploads((items) => items.filter((item) => item.id !== id)), []);
  const clearCompletedUploads = useCallback(() => setUploads((items) => items.filter((item) => item.status === "uploading")), []);
  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) enqueueUploads(event.target.files);
    event.target.value = "";
  };
  const onDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!canUpload || !Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    setDragActive(true);
  };
  const onDragOver = (event: DragEvent<HTMLElement>) => {
    if (!canUpload) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const onDrop = (event: DragEvent<HTMLElement>) => {
    if (!canUpload) return;
    event.preventDefault();
    setDragActive(false);
    if (event.dataTransfer.files.length) enqueueUploads(event.dataTransfer.files);
  };

  const submitLogin = async (username: string, password: string, otp: string) => {
    setLoginBusy(true);
    setLoginError("");
    try {
      const result = await login(username, password, otp);
      setToken(result.token);
      setLoginOpen(false);
      setNeedsOtp(false);
      setUserResolved(false);
      loadUser();
      refresh();
    } catch (reason) {
      if (reason instanceof ApiError && (reason.status === 402 || reason.code === 402)) {
        setNeedsOtp(true);
        setLoginError("Enter the verification code from your authenticator.");
      } else {
        setLoginError(reason instanceof ApiError ? reason.message : "Sign in failed.");
      }
    } finally {
      setLoginBusy(false);
    }
  };

  const signOut = async () => {
    try { await logout(); } catch { /* Clear the local session even if the server is unavailable. */ }
    void clearThumbnailSession().catch(() => {});
    setToken("");
    setUser(null);
    setUserResolved(true);
    navigate("/");
    refresh();
  };

  const breadcrumbParts = currentPath.split("/").filter(Boolean);
  const currentName = breadcrumbParts.at(-1) ?? t("nav.files");
  const isSignedIn = Boolean(getToken());

  return (
    <div className="app-shell">
      <header className="mobile-header">
        <button className="icon-button" onClick={() => setSidebarOpen(true)} title="Open navigation"><Menu size={22} /></button>
        <button className="brand brand--mobile" onClick={() => navigate("/")}><BrandMark /><span>OpenList</span></button>
        <UserButton user={user} isSignedIn={isSignedIn} onLogin={() => setLoginOpen(true)} onLogout={signOut} compact />
      </header>

      <aside className={`sidebar${sidebarOpen ? " sidebar--open" : ""}`}>
        <div className="sidebar__top">
          <button className="brand" onClick={() => navigate("/")}><BrandMark /><span>OpenList</span></button>
          <button className="icon-button sidebar__close" onClick={() => setSidebarOpen(false)} title="Close navigation"><X size={20} /></button>
        </div>
        <nav className="sidebar__nav" aria-label="Main navigation">
          <button className={`nav-item${appView === "files" ? " nav-item--active" : ""}`} onClick={() => navigate("/")}><HardDrive size={20} /><span>{t("nav.files")}</span></button>
          {user?.role === ADMIN_ROLE && <button className={`nav-item${isAdminView(appView) ? " nav-item--active" : ""}`} onClick={() => navigateToAdmin("storages")}><Settings2 size={20} /><span>{t("nav.settings")}</span></button>}
        </nav>
        <div className="storage-summary">
          <div className="storage-summary__title"><Cloud size={18} /><strong>OpenList storage</strong></div>
          <p>Files are streamed directly from your connected storage.</p>
        </div>
        <div className="sidebar__account">
          <UserButton user={user} isSignedIn={isSignedIn} onLogin={() => setLoginOpen(true)} onLogout={signOut} />
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}

      <main className="main-content">
        <div className={`topbar${isAdminView(appView) ? " topbar--admin" : ""}`}>
          {appView === "files" ? (
            <>
              <nav className="breadcrumbs" aria-label="Breadcrumb">
                <button onClick={() => navigate("/")} title={t("nav.files")}><HardDrive size={19} /><span>{t("nav.files")}</span></button>
                {breadcrumbParts.map((part, index) => {
                  const path = `/${breadcrumbParts.slice(0, index + 1).join("/")}`;
                  return <span className="breadcrumb-part" key={path}><ChevronRight size={17} /><button onClick={() => navigate(path)}>{part}</button></span>;
                })}
              </nav>
              <div className="search-actions">
                <label className="search-box">
                  <Search size={19} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("files.searchCurrent", { name: currentName })} aria-label={t("files.searchCurrent", { name: currentName })} />
                  {query && <button onClick={() => setQuery("")} title={t("common.clear")}><X size={17} /></button>}
                </label>
                <button className="icon-button bordered-button" onClick={() => setAdvancedSearchOpen(true)} title={t("files.advancedSearch")}><SlidersHorizontal size={18} /></button>
              </div>
            </>
          ) : (
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              <button onClick={() => navigate("/")} title={t("nav.files")}><HardDrive size={19} /><span>{t("nav.files")}</span></button>
              <span className="breadcrumb-part"><ChevronRight size={17} /><button onClick={() => navigateToAdmin("storages")}>{t("nav.settings")}</button></span>
              <span className="breadcrumb-part"><ChevronRight size={17} /><button onClick={() => navigateToAdmin(appView)}>{appView === "users" ? t("settings.users") : appView === "native" ? t("settings.native") : t("settings.storage")}</button></span>
            </nav>
          )}
        </div>

        {appView === "files" ? <section className={`browser-section${dragActive ? " browser-section--drop-active" : ""}`} aria-labelledby="folder-title" onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false); }} onDrop={onDrop}>
          <div className="browser-heading">
            <div>
              <h1 id="folder-title">{currentName}</h1>
              <p>{loading ? "Loading files" : `${data.total} ${data.total === 1 ? "item" : "items"}`}{data.provider && data.provider !== "unknown" ? ` · ${data.provider}` : ""}</p>
            </div>
            <div className="browser-actions">
              {canUpload && <><input className="file-input" ref={fileInputRef} type="file" multiple onChange={onFileInput} /><button className="primary-button upload-button" onClick={() => fileInputRef.current?.click()}><Upload size={17} /> {t("common.upload")}</button></>}
              <button className="icon-button bordered-button" onClick={refresh} disabled={loading} title="Refresh folder"><RefreshCw className={loading ? "spin" : ""} size={18} /></button>
              <label className="sort-select" title="Sort files">
                <ArrowDownAZ size={18} />
                <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} aria-label="Sort files by">
                  <option value="name">Name</option>
                  <option value="modified">Modified</option>
                  <option value="size">Size</option>
                </select>
                <ChevronDown size={15} />
              </label>
              <button className="icon-button bordered-button" onClick={() => setSortDirection((value) => value === "asc" ? "desc" : "asc")} title={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}>
                <span className={`sort-direction${sortDirection === "desc" ? " sort-direction--desc" : ""}`}>↑</span>
              </button>
              <div className="view-switch" aria-label="File layout">
                <button className={view === "grid" ? "active" : ""} onClick={() => changeView("grid")} aria-pressed={view === "grid"} title="Grid view"><Grid2X2 size={18} /></button>
                <button className={view === "list" ? "active" : ""} onClick={() => changeView("list")} aria-pressed={view === "list"} title="List view"><List size={19} /></button>
              </div>
            </div>
          </div>

          {data.header && !loading && <div className="folder-note">{data.header}</div>}

          <FileSelectionBar count={selectedItems.length} permissions={filePermissions} canCopyLink={selectedItems.length === 1 && !selectedItems[0]?.is_dir} onAction={beginFileOperation} onClear={() => { setSelectedNames(new Set()); setActionMenu(null); }} />

          {error ? (
            <ErrorState error={error} onRetry={refresh} onLogin={() => setLoginOpen(true)} onPassword={() => setPasswordOpen(true)} />
          ) : !loading && items.length === 0 ? (
            <div className="empty-state">
              {query ? <Search size={34} /> : <FolderOpen size={38} />}
              <h2>{query ? "No matching files" : "This folder is empty"}</h2>
              <p>{query ? `Nothing in this folder matches “${query}”.` : "Files added to this OpenList path will appear here."}</p>
              {query && <button className="secondary-button" onClick={() => setQuery("")}>Clear search</button>}
            </div>
          ) : (
            <FileBrowser
              items={items}
              view={view}
              loading={loading}
              directoryPath={currentPath}
              customThumbnailsEnabled={thumbnailSessionReady}
              onOpen={openItem}
              onDownload={downloadItem}
              canManage={canManageFiles}
              canCopyLink={Boolean(filePermissions.copyLink)}
              selectedNames={selectedNames}
              onToggleSelection={toggleSelection}
              onToggleAll={toggleAll}
              onOpenActions={openFileActions}
            />
          )}

          {data.readme && !loading && <div className="folder-readme"><h2>About this folder</h2><p>{data.readme}</p></div>}
          {dragActive && <div className="file-drop-target" aria-hidden="true"><Upload size={34} /><strong>Drop files to upload</strong><span>{currentPath}</span></div>}
        </section> : (
          <AdminStorageGate
            user={user}
            resolved={userResolved}
            signedIn={isSignedIn}
            onLogin={() => setLoginOpen(true)}
            onStorageChanged={refresh}
            view={appView}
            onSelectView={navigateToAdmin}
            thumbnailSessionReady={thumbnailSessionReady}
          />
        )}
      </main>

      {gallery && <Gallery images={gallery.images} initialIndex={gallery.index} directoryPath={currentPath} password={passwords[currentPath] ?? ""} onClose={() => setGallery(null)} />}
      {video && <VideoModal {...video} onClose={() => setVideo(null)} />}
      {advancedSearchOpen && <AdvancedSearch initialLocation={currentPath} passwordForPath={(path) => passwords[path] ?? ""} onClose={() => setAdvancedSearchOpen(false)} onNavigate={navigate} />}
      {mediaLoading && <div className="media-loading" role="status"><LoaderCircle className="spin" size={21} /><span>Preparing {mediaLoading}</span></div>}
      {notice && <div className={`toast${noticeTone === "success" ? " toast--success" : ""}${uploads.length ? " toast--with-uploads" : ""}`} role={noticeTone === "error" ? "alert" : "status"}>{noticeTone === "success" ? <CheckCircle2 size={19} /> : <ShieldAlert size={19} />}<span>{notice}</span><button onClick={() => setNotice("")} title="Dismiss"><X size={17} /></button></div>}
      <UploadQueue uploads={uploads} onCancel={cancelUpload} onDismiss={dismissUpload} onClearCompleted={clearCompletedUploads} />
      {actionMenu && selectedItems.length > 0 && <FileActionMenu point={actionMenu} count={selectedItems.length} permissions={filePermissions} canCopyLink={selectedItems.length === 1 && !selectedItems[0]?.is_dir} onAction={beginFileOperation} onClose={() => setActionMenu(null)} />}
      {fileOperation === "rename" && selectedItems.length === 1 && <RenameDialog item={selectedItems[0]} busy={operationBusy} error={operationError} onClose={closeFileOperation} onSubmit={(name) => void runFileOperation("rename", name)} />}
      {fileOperation === "delete" && selectedItems.length > 0 && <DeleteDialog items={selectedItems} busy={operationBusy} error={operationError} onClose={closeFileOperation} onConfirm={() => void runFileOperation("delete")} />}
      {(fileOperation === "copy" || fileOperation === "move") && selectedItems.length > 0 && <FolderPickerDialog operation={fileOperation} sourcePath={currentPath} items={selectedItems} passwords={passwords} busy={operationBusy} operationError={operationError} onClose={closeFileOperation} onConfirm={(destination) => void runFileOperation(fileOperation, destination)} />}
      {loginOpen && <LoginDialog busy={loginBusy} error={loginError} needsOtp={needsOtp} onClose={() => { setLoginOpen(false); setLoginError(""); }} onSubmit={submitLogin} />}
      {passwordOpen && <PasswordDialog path={currentPath} onClose={() => setPasswordOpen(false)} onSubmit={(password) => { setPasswords((value) => ({ ...value, [currentPath]: password })); setPasswordOpen(false); }} />}
    </div>
  );
}

function BrandMark() {
  return <span className="brand-mark"><Files size={22} strokeWidth={2.2} /></span>;
}

interface UserButtonProps {
  user: OpenListUser | null;
  isSignedIn: boolean;
  onLogin: () => void;
  onLogout: () => void;
  compact?: boolean;
}

function UserButton({ user, isSignedIn, onLogin, onLogout, compact = false }: UserButtonProps) {
  if (compact) {
    return <button className="icon-button mobile-account" onClick={isSignedIn ? onLogout : onLogin} title={isSignedIn ? "Sign out" : "Sign in"}><CircleUserRound size={22} /></button>;
  }
  return isSignedIn ? (
    <div className="account-row">
      <span className="account-avatar">{user?.username?.slice(0, 1).toUpperCase() || "U"}</span>
      <span className="account-copy"><strong>{user?.username || "OpenList user"}</strong><small>Signed in</small></span>
      <button className="icon-button" onClick={onLogout} title="Sign out"><LogOut size={18} /></button>
    </div>
  ) : (
    <button className="sign-in-button" onClick={onLogin}><LogIn size={18} /><span>Sign in</span></button>
  );
}

function ErrorState({ error, onRetry, onLogin, onPassword }: { error: ApiError; onRetry: () => void; onLogin: () => void; onPassword: () => void }) {
  const needsLogin = error.status === 401;
  const mayNeedPassword = error.status === 403;
  return (
    <div className="empty-state error-state">
      <ShieldAlert size={38} />
      <h2>{needsLogin ? "Sign in required" : mayNeedPassword ? "This folder is protected" : "Couldn’t load this folder"}</h2>
      <p>{error.message}</p>
      <div className="error-state__actions">
        {needsLogin && <button className="primary-button" onClick={onLogin}>Sign in</button>}
        {mayNeedPassword && <button className="primary-button" onClick={onPassword}>Enter password</button>}
        <button className="secondary-button" onClick={onRetry}>Try again</button>
      </div>
    </div>
  );
}

function AdminStorageGate({
  user,
  resolved,
  signedIn,
  onLogin,
  onStorageChanged,
  view,
  onSelectView,
  thumbnailSessionReady,
}: {
  user: OpenListUser | null;
  resolved: boolean;
  signedIn: boolean;
  onLogin: () => void;
  onStorageChanged: () => void;
  view: Exclude<AppView, "files">;
  onSelectView: (view: Exclude<AppView, "files">) => void;
  thumbnailSessionReady: boolean;
}) {
  const { t } = useTranslation();
  if (!resolved) {
    return <div className="admin-gate" role="status"><LoaderCircle className="spin" size={28} /><span>Checking administrator access</span></div>;
  }
  if (!signedIn) {
    return (
      <div className="admin-gate">
        <Settings2 size={38} />
        <h1>Administrator sign-in required</h1>
        <p>Sign in with an OpenList administrator account to manage settings.</p>
        <button className="primary-button" onClick={onLogin}><LogIn size={18} /> Sign in</button>
      </div>
    );
  }
  if (user?.role !== ADMIN_ROLE) {
    return (
      <div className="admin-gate">
        <ShieldAlert size={38} />
        <h1>Administrator access required</h1>
        <p>Your OpenList account does not have permission to manage settings.</p>
      </div>
    );
  }
  return <><nav className="admin-tabs" aria-label={t("nav.settings")}><button className={view === "storages" ? "active" : ""} onClick={() => onSelectView("storages")} aria-current={view === "storages" ? "page" : undefined}>{t("settings.storage")}</button><button className={view === "users" ? "active" : ""} onClick={() => onSelectView("users")} aria-current={view === "users" ? "page" : undefined}>{t("settings.users")}</button><button className={view === "native" ? "active" : ""} onClick={() => onSelectView("native")} aria-current={view === "native" ? "page" : undefined}>{t("settings.native")}</button><LanguageSelector /></nav>{view === "users" ? <UserManagement /> : view === "native" ? <NativeManagement sessionReady={thumbnailSessionReady} /> : <StorageManagement onStorageChanged={onStorageChanged} />}</>;
}
