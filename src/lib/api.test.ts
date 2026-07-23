// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { getFile, listStorages, setStorageEnabled, setToken } from "./api";

afterEach(() => {
  vi.restoreAllMocks();
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
});
