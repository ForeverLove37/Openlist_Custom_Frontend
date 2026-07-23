import type {
  ApiEnvelope,
  DirectoryData,
  FileDetail,
  LoginResult,
  OpenListStorage,
  OpenListUser,
  StoragePage,
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
