// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { getFile, setToken } from "./api";

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
});
