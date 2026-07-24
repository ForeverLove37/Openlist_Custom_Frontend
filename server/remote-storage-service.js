import axios from "axios";

const REMOTE_DRIVERS = new Set(["OpenList", "AList V3"]);

export class RemoteStorageError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "RemoteStorageError";
    this.status = status;
  }
}

function positiveId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new RemoteStorageError(`${label} is invalid.`, 400);
  return id;
}

function parseConnection(storage) {
  if (!storage || !REMOTE_DRIVERS.has(storage.driver)) {
    throw new RemoteStorageError("The selected storage is not a remote OpenList connection.", 400);
  }
  let addition;
  try {
    addition = JSON.parse(storage.addition || "{}");
  } catch {
    throw new RemoteStorageError("The remote storage configuration is invalid.", 500);
  }
  let url;
  try {
    url = new URL(addition.url);
  } catch {
    throw new RemoteStorageError("The remote OpenList URL is invalid.", 500);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RemoteStorageError("The remote OpenList URL must use HTTP or HTTPS.", 500);
  }
  if (typeof addition.token !== "string" || addition.token.length === 0 || addition.token.length > 4096) {
    throw new RemoteStorageError("The remote OpenList token is missing.", 500);
  }
  return { baseUrl: url.toString().replace(/\/$/, ""), token: addition.token };
}

function envelopeData(response, fallbackMessage) {
  if (response.status < 200 || response.status >= 300 || response.data?.code !== 200) {
    const status = response.status === 401 || response.status === 403 ? 403 : 502;
    throw new RemoteStorageError(response.data?.message || fallbackMessage, status);
  }
  return response.data.data;
}

function sanitizedStorage(storage) {
  if (!storage || typeof storage !== "object") return storage;
  return { ...storage, addition: "" };
}

export function createRemoteStorageService({
  openListBaseUrl = process.env.OPENLIST_API_URL || "http://127.0.0.1:5244",
  httpClient = axios,
} = {}) {
  async function request(config, message) {
    try {
      return await httpClient.request({
        timeout: 20_000,
        maxRedirects: 5,
        validateStatus: () => true,
        ...config,
      });
    } catch {
      throw new RemoteStorageError(message);
    }
  }

  async function connection(session, connectionId) {
    const id = positiveId(connectionId, "Remote connection ID");
    const response = await request({
      method: "GET",
      url: `${openListBaseUrl}/api/admin/storage/get?id=${encodeURIComponent(id)}`,
      headers: { Authorization: session.authorization },
    }, "Could not load the local remote-storage connection.");
    return parseConnection(envelopeData(response, "Could not load the local remote-storage connection."));
  }

  async function remoteRequest(session, connectionId, config, message) {
    const remote = await connection(session, connectionId);
    const response = await request({
      ...config,
      url: `${remote.baseUrl}${config.url}`,
      headers: { ...config.headers, Authorization: remote.token },
    }, message);
    return envelopeData(response, message);
  }

  async function list(session, connectionId) {
    const page = await remoteRequest(session, connectionId, {
      method: "GET",
      url: "/api/admin/storage/list?page=1&per_page=0",
    }, "Could not load storage settings from the remote OpenList instance.");
    return {
      ...page,
      content: Array.isArray(page?.content) ? page.content.map(sanitizedStorage) : [],
    };
  }

  async function updateTransferMode(session, connectionId, storageId, values = {}) {
    const id = positiveId(storageId, "Remote storage ID");
    if (typeof values.web_proxy !== "boolean" || typeof values.proxy_range !== "boolean") {
      throw new RemoteStorageError("A valid remote transfer mode is required.", 400);
    }
    const storage = await remoteRequest(session, connectionId, {
      method: "GET",
      url: `/api/admin/storage/get?id=${encodeURIComponent(id)}`,
    }, "Could not load the remote storage.");
    if (!storage || typeof storage !== "object") throw new RemoteStorageError("The remote storage response is invalid.");
    const updated = {
      ...storage,
      web_proxy: values.web_proxy,
      webdav_policy: values.web_proxy ? "native_proxy" : "302_redirect",
      proxy_range: values.web_proxy && values.proxy_range,
    };
    await remoteRequest(session, connectionId, {
      method: "POST",
      url: "/api/admin/storage/update",
      data: updated,
      headers: { "Content-Type": "application/json" },
    }, "Could not update the remote storage transfer mode.");
    return sanitizedStorage(updated);
  }

  return { list, updateTransferMode };
}
