export class AndroidReleaseError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "AndroidReleaseError";
    this.status = status;
  }
}

function serviceUrl(baseUrl, endpoint) {
  if (!baseUrl) throw new AndroidReleaseError("Android release service is not configured.", 503);
  try {
    return new URL(endpoint, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
  } catch {
    throw new AndroidReleaseError("Android release service URL is invalid.", 503);
  }
}

export function createAndroidReleaseService({
  baseUrl = process.env.ANDROID_BUILD_SERVICE_URL || "",
  token = process.env.ANDROID_BUILD_SERVICE_TOKEN || "",
  downloadBaseUrl = process.env.ANDROID_DOWNLOAD_BASE_URL || "https://dl-chatapp.zengjunjie.com",
  fetchImpl = fetch,
} = {}) {
  const decorate = (payload) => {
    if (!payload || !Array.isArray(payload.releases)) return payload;
    return {
      ...payload,
      releases: payload.releases.map((release) => ({ ...release, downloadUrl: `${downloadBaseUrl.replace(/\/$/, "")}/apk/${encodeURIComponent(release.filename)}` })),
    };
  };
  async function request(endpoint, { method = "GET", body, contentType, timeoutMs = 30_000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = new Headers({ Accept: "application/json" });
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (contentType) headers.set("Content-Type", contentType);
    try {
      const response = await fetchImpl(serviceUrl(baseUrl, endpoint), { method, headers, body, signal: controller.signal });
      let payload;
      try { payload = await response.json(); } catch { throw new AndroidReleaseError("Android release service returned an invalid response.", response.status || 502); }
      if (!response.ok || payload?.ok === false) {
        throw new AndroidReleaseError(payload?.message || "Android release service request failed.", response.status || 502);
      }
      return payload;
    } catch (error) {
      if (error instanceof AndroidReleaseError) throw error;
      throw new AndroidReleaseError(error?.name === "AbortError" ? "Android release service timed out." : "Could not reach the Android release service.");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    list: async () => decorate(await request("/api/releases")),
    latest: async () => {
      const payload = await request("/api/releases/latest");
      return payload?.latest ? { ...payload, latest: { ...payload.latest, downloadUrl: `${downloadBaseUrl.replace(/\/$/, "")}/apk/${encodeURIComponent(payload.latest.filename)}` } } : payload;
    },
    triggerBuild: (values) => request("/api/admin/build", { method: "POST", body: JSON.stringify(values), contentType: "application/json", timeoutMs: 30_000 }),
    buildStatus: (id) => request(`/api/admin/build/${encodeURIComponent(id)}`),
    publish: (version) => request(`/api/admin/releases/${encodeURIComponent(version)}/publish`, { method: "POST", body: "{}", contentType: "application/json" }),
    uploadIcon: (body, contentType) => request("/api/admin/icon", { method: "PUT", body, contentType, timeoutMs: 30_000 }),
    deleteIcon: () => request("/api/admin/icon", { method: "DELETE", body: "{}", contentType: "application/json" }),
  };
}
