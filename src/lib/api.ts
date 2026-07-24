import type {
  ApiEnvelope,
  DirectoryData,
  FileDetail,
  LoginResult,
  ManagedUser,
  OpenListStorage,
  OpenListUser,
  SearchPage,
  SearchRequest,
  StoragePage,
  UserPage,
} from "./types";

const TOKEN_KEY = "openlist-drive-token";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: number,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setToken(token: string) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", token);

  let response: Response;
  try {
    response = await fetch(`/api${endpoint}`, { ...options, headers, signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Could not reach the OpenList server.", 0);
  }

  let payload: ApiEnvelope<T>;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError("The server returned an invalid response.", response.status);
  }

  if (!response.ok || payload.code !== 200) {
    throw new ApiError(
      payload.message || "Request failed.",
      response.ok ? payload.code : response.status,
      payload.code,
      payload.data,
    );
  }
  return payload.data;
}

export function listDirectory(path: string, password = "", signal?: AbortSignal) {
  return request<DirectoryData>(
    "/fs/list",
    {
      method: "POST",
      body: JSON.stringify({ path, password, page: 1, per_page: 0 }),
    },
    signal,
  );
}

export function getFile(path: string, password = "", signal?: AbortSignal) {
  return request<FileDetail>(
    "/fs/get",
    { method: "POST", body: JSON.stringify({ path, password }) },
    signal,
  );
}

export function searchFiles({ parent, keywords, scope, page = 1, perPage = 100, password = "" }: SearchRequest, signal?: AbortSignal) {
  return request<SearchPage>("/fs/search", {
    method: "POST",
    body: JSON.stringify({ parent, keywords, scope, page, per_page: perPage, password }),
  }, signal);
}

export function renameEntry(path: string, name: string) {
  return request<unknown>("/fs/rename", {
    method: "POST",
    body: JSON.stringify({ path, name, overwrite: false }),
  });
}

export function removeEntries(dir: string, names: string[]) {
  return request<unknown>("/fs/remove", {
    method: "POST",
    body: JSON.stringify({ dir, names }),
  });
}

function transferEntries(endpoint: "/fs/copy" | "/fs/move", srcDir: string, dstDir: string, names: string[]) {
  return request<unknown>(endpoint, {
    method: "POST",
    body: JSON.stringify({
      src_dir: srcDir,
      dst_dir: dstDir,
      names,
      overwrite: false,
      skip_existing: false,
      merge: false,
    }),
  });
}

export function copyEntries(srcDir: string, dstDir: string, names: string[]) {
  return transferEntries("/fs/copy", srcDir, dstDir, names);
}

export function moveEntries(srcDir: string, dstDir: string, names: string[]) {
  return transferEntries("/fs/move", srcDir, dstDir, names);
}

export function login(username: string, password: string, otpCode = "") {
  return request<LoginResult>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password, otp_code: otpCode }),
  });
}

export function getCurrentUser(signal?: AbortSignal) {
  return request<OpenListUser>("/me", {}, signal);
}

export function logout() {
  return request<unknown>("/auth/logout");
}

export function listStorages(signal?: AbortSignal) {
  return request<StoragePage>("/admin/storage/list?page=1&per_page=0", {}, signal);
}

export function getStorage(id: number, signal?: AbortSignal) {
  return request<OpenListStorage>(`/admin/storage/get?id=${encodeURIComponent(id)}`, {}, signal);
}

export function createStorage(storage: OpenListStorage) {
  return request<{ id: number }>("/admin/storage/create", {
    method: "POST",
    body: JSON.stringify(storage),
  });
}

export function updateStorage(storage: OpenListStorage) {
  return request<unknown>("/admin/storage/update", {
    method: "POST",
    body: JSON.stringify(storage),
  });
}

export function setStorageEnabled(id: number, enabled: boolean) {
  const action = enabled ? "enable" : "disable";
  return request<unknown>(`/admin/storage/${action}?id=${encodeURIComponent(id)}`, { method: "POST" });
}

export function deleteStorage(id: number) {
  return request<unknown>(`/admin/storage/delete?id=${encodeURIComponent(id)}`, { method: "POST" });
}

export function listRemoteStorages(connectionId: number, signal?: AbortSignal) {
  return request<StoragePage>(`/custom/remote-storages/${encodeURIComponent(connectionId)}`, {}, signal);
}

export function updateRemoteStorageTransferMode(connectionId: number, storageId: number, webProxy: boolean, proxyRange: boolean) {
  return request<OpenListStorage>(`/custom/remote-storages/${encodeURIComponent(connectionId)}/${encodeURIComponent(storageId)}/transfer`, {
    method: "PATCH",
    body: JSON.stringify({ web_proxy: webProxy, proxy_range: proxyRange }),
  });
}

export function listUsers(signal?: AbortSignal) {
  return request<UserPage>("/admin/user/list?page=1&per_page=0", {}, signal);
}

export function getUser(id: number, signal?: AbortSignal) {
  return request<ManagedUser>(`/admin/user/get?id=${encodeURIComponent(id)}`, {}, signal);
}

export function createUser(user: ManagedUser) {
  return request<unknown>("/admin/user/create", {
    method: "POST",
    body: JSON.stringify(user),
  });
}

export function updateUser(user: ManagedUser) {
  return request<unknown>("/admin/user/update", {
    method: "POST",
    body: JSON.stringify(user),
  });
}

export function deleteUser(id: number) {
  return request<unknown>(`/admin/user/delete?id=${encodeURIComponent(id)}`, { method: "POST" });
}

export function syncThumbnailSession(path: string, password = "") {
  return request<unknown>("/custom/session", {
    method: "POST",
    body: JSON.stringify({ path, password }),
  });
}

export function clearThumbnailSession() {
  return request<unknown>("/custom/session/clear", { method: "POST" });
}

interface UploadOptions {
  password?: string;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

export function uploadFile(file: File, path: string, options: UploadOptions = {}) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const finish = () => options.signal?.removeEventListener("abort", abort);

    if (options.signal?.aborted) {
      reject(new DOMException("Upload cancelled", "AbortError"));
      return;
    }

    xhr.open("PUT", "/api/fs/form");
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("File-Path", encodeURIComponent(path));
    xhr.setRequestHeader("Overwrite", "true");
    xhr.setRequestHeader("Last-Modified", String(file.lastModified));
    if (options.password) xhr.setRequestHeader("Password", options.password);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", token);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onerror = () => {
      finish();
      reject(new ApiError("Could not reach the OpenList server.", xhr.status || 0));
    };
    xhr.onabort = () => {
      finish();
      reject(new DOMException("Upload cancelled", "AbortError"));
    };
    xhr.onload = () => {
      finish();
      let payload: ApiEnvelope<unknown>;
      try {
        payload = JSON.parse(xhr.responseText) as ApiEnvelope<unknown>;
      } catch {
        reject(new ApiError("The server returned an invalid upload response.", xhr.status));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300 || payload.code !== 200) {
        reject(new ApiError(payload.message || "Upload failed.", xhr.status === 200 ? payload.code : xhr.status, payload.code, payload.data));
        return;
      }
      options.onProgress?.(100);
      resolve();
    };
    options.signal?.addEventListener("abort", abort, { once: true });

    const form = new FormData();
    form.append("file", file, file.name);
    xhr.send(form);
  });
}
