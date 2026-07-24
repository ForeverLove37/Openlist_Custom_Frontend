import { describe, expect, it, vi } from "vitest";
import { RemoteStorageError, createRemoteStorageService } from "./remote-storage-service.js";

const session = { authorization: "local-admin-token" };

function response(data) {
  return { status: 200, data: { code: 200, message: "success", data } };
}

function connectionStorage(overrides = {}) {
  return {
    id: 3,
    driver: "OpenList",
    addition: JSON.stringify({ url: "https://remote.example.com/", token: "remote-admin-token" }),
    ...overrides,
  };
}

describe("remote storage service", () => {
  it("lists downstream storages without exposing their additions or connection token", async () => {
    const httpClient = { request: vi.fn()
      .mockResolvedValueOnce(response(connectionStorage()))
      .mockResolvedValueOnce(response({ content: [{ id: 8, mount_path: "/WebDAV", addition: "secret-config" }], total: 1 })) };
    const service = createRemoteStorageService({ openListBaseUrl: "http://openlist.local", httpClient });

    const page = await service.list(session, 3);

    expect(page.content[0]).toMatchObject({ id: 8, mount_path: "/WebDAV", addition: "" });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      url: "https://remote.example.com/api/admin/storage/list?page=1&per_page=0",
      headers: { Authorization: "remote-admin-token" },
      maxRedirects: 5,
    }));
  });

  it("updates only the downstream transfer settings while preserving the full storage payload", async () => {
    const downstream = {
      id: 8,
      mount_path: "/WebDAV",
      driver: "WebDav",
      addition: "{\"password\":\"preserve-me\"}",
      web_proxy: true,
      webdav_policy: "native_proxy",
      proxy_range: true,
    };
    const httpClient = { request: vi.fn()
      .mockResolvedValueOnce(response(connectionStorage()))
      .mockResolvedValueOnce(response(downstream))
      .mockResolvedValueOnce(response(connectionStorage()))
      .mockResolvedValueOnce(response(null)) };
    const service = createRemoteStorageService({ openListBaseUrl: "http://openlist.local", httpClient });

    const updated = await service.updateTransferMode(session, 3, 8, { web_proxy: false, proxy_range: true });

    expect(updated).toMatchObject({ id: 8, web_proxy: false, webdav_policy: "302_redirect", proxy_range: false, addition: "" });
    expect(httpClient.request).toHaveBeenNthCalledWith(4, expect.objectContaining({
      method: "POST",
      url: "https://remote.example.com/api/admin/storage/update",
      data: expect.objectContaining({ addition: downstream.addition, web_proxy: false, webdav_policy: "302_redirect", proxy_range: false }),
    }));
  });

  it("rejects local storages as remote management connections", async () => {
    const httpClient = { request: vi.fn().mockResolvedValue(response(connectionStorage({ driver: "Local" }))) };
    const service = createRemoteStorageService({ httpClient });
    await expect(service.list(session, 3)).rejects.toBeInstanceOf(RemoteStorageError);
  });
});
