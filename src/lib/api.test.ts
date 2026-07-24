// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyEntries, createUser, getFile, listStorages, listUsers, moveEntries, removeEntries, renameEntry, searchFiles, setStorageEnabled, setToken, syncThumbnailSession, uploadFile } from "./api";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("OpenList API client", () => {
  it("sends the raw authorization token and file password", async () => {
    setToken("jwt-token");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: 200, message: "success", data: { raw_url: "https://files.test/photo.jpg" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await getFile("/Photos/photo.jpg", "folder-secret");
    expect(result.raw_url).toBe("https://files.test/photo.jpg");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/fs/get");
    expect(new Headers(options?.headers).get("Authorization")).toBe("jwt-token");
    expect(JSON.parse(String(options?.body))).toEqual({ path: "/Photos/photo.jpg", password: "folder-secret" });
  });

  it("uses the OpenList envelope code as the effective error status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: 401, message: "Guest user is disabled", data: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(getFile("/private.jpg")).rejects.toMatchObject({
      status: 401,
      code: 401,
      message: "Guest user is disabled",
    });
  });

  it("calls admin storage endpoints with authentication and explicit actions", async () => {
    setToken("admin-token");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 200,
        message: "success",
        data: { content: [], total: 0 },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 200,
        message: "success",
        data: null,
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await listStorages();
    await setStorageEnabled(12, false);

    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/storage/list?page=1&per_page=0");
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("Authorization")).toBe("admin-token");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/admin/storage/disable?id=12");
    expect(fetchMock.mock.calls[1][1]?.method).toBe("POST");
  });

  it("calls the protected user endpoints with the complete user payload", async () => {
    setToken("admin-token");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, message: "success", data: { content: [], total: 0 } }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, message: "success", data: null }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await listUsers();
    await createUser({ id: 0, username: "alex", password: "secret", base_path: "/Team", role: 0, disabled: false, permission: 264, allow_ldap: true });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/user/list?page=1&per_page=0");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/admin/user/create");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ username: "alex", base_path: "/Team", permission: 264 });
  });

  it("uploads multipart data to the active OpenList path with progress", async () => {
    const progress = vi.fn();
    const requests: Array<{ method?: string; url?: string; headers: Record<string, string> }> = [];
    class FakeXMLHttpRequest {
      upload: { onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      onload: (() => void) | null = null;
      status = 200;
      responseText = JSON.stringify({ code: 200, message: "success", data: null });
      private request: { method?: string; url?: string; headers: Record<string, string> } = { headers: {} };
      constructor() { requests.push(this.request); }
      open(method: string, url: string) { this.request.method = method; this.request.url = url; }
      setRequestHeader(name: string, value: string) { this.request.headers[name] = value; }
      send() { this.upload.onprogress?.({ lengthComputable: true, loaded: 4, total: 4 }); this.onload?.(); }
      abort() { this.onabort?.(); }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
    setToken("upload-token");

    await uploadFile(new File(["data"], "report.txt", { type: "text/plain", lastModified: 1 }), "/Team/report.txt", { onProgress: progress });

    expect(requests[0]).toMatchObject({ method: "PUT", url: "/api/fs/form", headers: { Authorization: "upload-token", "File-Path": "%2FTeam%2Freport.txt", Overwrite: "true" } });
    expect(progress).toHaveBeenLastCalledWith(100);
  });

  it("creates a same-origin thumbnail session without exposing the token in a URL", async () => {
    setToken("thumbnail-token");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => (
      new Response(JSON.stringify({ code: 200, message: "success", data: null }), { status: 200, headers: { "Content-Type": "application/json" } })
    ));

    await syncThumbnailSession("/Pictures", "folder-password");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/custom/session");
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("Authorization")).toBe("thumbnail-token");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ path: "/Pictures", password: "folder-password" });
  });

  it("maps file management operations to the OpenList batch contracts", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => (
      new Response(JSON.stringify({ code: 200, message: "success", data: null }), { status: 200, headers: { "Content-Type": "application/json" } })
    ));

    await renameEntry("/Team/old.txt", "new.txt");
    await removeEntries("/Team", ["old.txt", "draft"]);
    await copyEntries("/Team", "/Archive", ["report.txt"]);
    await moveEntries("/Team", "/Published", ["final.txt"]);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/fs/rename", "/api/fs/remove", "/api/fs/copy", "/api/fs/move"]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ path: "/Team/old.txt", name: "new.txt", overwrite: false });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ dir: "/Team", names: ["old.txt", "draft"] });
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toMatchObject({ src_dir: "/Team", dst_dir: "/Archive", names: ["report.txt"], overwrite: false });
    expect(JSON.parse(String(fetchMock.mock.calls[3][1]?.body))).toMatchObject({ src_dir: "/Team", dst_dir: "/Published", names: ["final.txt"], overwrite: false });
  });

  it("maps advanced search filters to the OpenList search contract", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: 200, message: "success", data: { content: [], total: 0 } }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    await searchFiles({ parent: "/Projects", keywords: "proposal", scope: 2, page: 1, perPage: 100, password: "folder-password" });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/fs/search");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ parent: "/Projects", keywords: "proposal", scope: 2, page: 1, per_page: 100, password: "folder-password" });
  });
});
