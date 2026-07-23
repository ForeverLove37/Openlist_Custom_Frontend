import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownAZ,
  ChevronDown,
  ChevronRight,
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
  X,
} from "lucide-react";
import { LoginDialog, PasswordDialog } from "./components/Dialogs";
import { FileBrowser } from "./components/FileBrowser";
import { Gallery } from "./components/Gallery";
import { StorageManagement } from "./components/StorageManagement";
import { VideoModal } from "./components/VideoModal";
import { ApiError, getCurrentUser, getFile, getToken, login, logout, setToken } from "./lib/api";
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
type AppView = "files" | "storages";

const ADMIN_ROLE = 2;

function viewFromLocation(): AppView {
  return window.location.pathname === "/admin/storages" ? "storages" : "files";
}

export default function App() {
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
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [needsOtp, setNeedsOtp] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [user, setUser] = useState<OpenListUser | null>(null);
  const [userResolved, setUserResolved] = useState(false);
  const { data, loading, error, refresh } = useDirectory(currentPath, passwords[currentPath] ?? "", appView === "files");

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
    setSidebarOpen(false);
  }, []);

  const navigateToStorages = useCallback(() => {
    window.history.pushState({}, "", "/admin/storages");
    setAppView("storages");
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
    setToken("");
    setUser(null);
    setUserResolved(true);
    navigate("/");
    refresh();
  };

  const breadcrumbParts = currentPath.split("/").filter(Boolean);
  const currentName = breadcrumbParts.at(-1) ?? "My files";
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
          <button className={`nav-item${appView === "files" ? " nav-item--active" : ""}`} onClick={() => navigate("/")}><HardDrive size={20} /><span>My files</span></button>
          {user?.role === ADMIN_ROLE && <button className={`nav-item${appView === "storages" ? " nav-item--active" : ""}`} onClick={navigateToStorages}><Settings2 size={20} /><span>Storage management</span></button>}
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
        <div className={`topbar${appView === "storages" ? " topbar--admin" : ""}`}>
          {appView === "files" ? (
            <>
              <nav className="breadcrumbs" aria-label="Breadcrumb">
                <button onClick={() => navigate("/")} title="My files"><HardDrive size={19} /><span>My files</span></button>
                {breadcrumbParts.map((part, index) => {
                  const path = `/${breadcrumbParts.slice(0, index + 1).join("/")}`;
                  return <span className="breadcrumb-part" key={path}><ChevronRight size={17} /><button onClick={() => navigate(path)}>{part}</button></span>;
                })}
              </nav>
              <label className="search-box">
                <Search size={19} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search in ${currentName}`} aria-label="Search current folder" />
                {query && <button onClick={() => setQuery("")} title="Clear search"><X size={17} /></button>}
              </label>
            </>
          ) : (
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              <button onClick={() => navigate("/")} title="My files"><HardDrive size={19} /><span>My files</span></button>
              <span className="breadcrumb-part"><ChevronRight size={17} /><button onClick={navigateToStorages}>Storage management</button></span>
            </nav>
          )}
        </div>

        {appView === "files" ? <section className="browser-section" aria-labelledby="folder-title">
          <div className="browser-heading">
            <div>
              <h1 id="folder-title">{currentName}</h1>
              <p>{loading ? "Loading files" : `${data.total} ${data.total === 1 ? "item" : "items"}`}{data.provider && data.provider !== "unknown" ? ` · ${data.provider}` : ""}</p>
            </div>
            <div className="browser-actions">
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
            <FileBrowser items={items} view={view} loading={loading} onOpen={openItem} onDownload={downloadItem} />
          )}

          {data.readme && !loading && <div className="folder-readme"><h2>About this folder</h2><p>{data.readme}</p></div>}
        </section> : (
          <AdminStorageGate
            user={user}
            resolved={userResolved}
            signedIn={isSignedIn}
            onLogin={() => setLoginOpen(true)}
            onStorageChanged={refresh}
          />
        )}
      </main>

      {gallery && <Gallery images={gallery.images} initialIndex={gallery.index} directoryPath={currentPath} password={passwords[currentPath] ?? ""} onClose={() => setGallery(null)} />}
      {video && <VideoModal {...video} onClose={() => setVideo(null)} />}
      {mediaLoading && <div className="media-loading" role="status"><LoaderCircle className="spin" size={21} /><span>Preparing {mediaLoading}</span></div>}
      {notice && <div className="toast" role="alert"><ShieldAlert size={19} /><span>{notice}</span><button onClick={() => setNotice("")} title="Dismiss"><X size={17} /></button></div>}
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
}: {
  user: OpenListUser | null;
  resolved: boolean;
  signedIn: boolean;
  onLogin: () => void;
  onStorageChanged: () => void;
}) {
  if (!resolved) {
    return <div className="admin-gate" role="status"><LoaderCircle className="spin" size={28} /><span>Checking administrator access</span></div>;
  }
  if (!signedIn) {
    return (
      <div className="admin-gate">
        <Settings2 size={38} />
        <h1>Administrator sign-in required</h1>
        <p>Sign in with an OpenList administrator account to manage storage connections.</p>
        <button className="primary-button" onClick={onLogin}><LogIn size={18} /> Sign in</button>
      </div>
    );
  }
  if (user?.role !== ADMIN_ROLE) {
    return (
      <div className="admin-gate">
        <ShieldAlert size={38} />
        <h1>Administrator access required</h1>
        <p>Your OpenList account does not have permission to manage storages.</p>
      </div>
    );
  }
  return <StorageManagement onStorageChanged={onStorageChanged} />;
}
