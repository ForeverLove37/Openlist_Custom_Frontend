import { describe, expect, it } from "vitest";
import { emptyStorageForm, normalizeMountPath, storageFromForm, storageStatus, storageToForm } from "./storage";
import type { OpenListStorage } from "./types";

function existingStorage(overrides: Partial<OpenListStorage> = {}): OpenListStorage {
  return {
    id: 7,
    mount_path: "/Remote",
    order: 1,
    driver: "WebDav",
    cache_expiration: 30,
    custom_cache_policies: "",
    status: "work",
    addition: JSON.stringify({
      vendor: "other",
      address: "https://dav.example.com",
      username: "admin",
      password: "secret",
      root_folder_path: "/files",
      tls_insecure_skip_verify: false,
      future_driver_option: "preserve-me",
    }),
    remark: "Primary remote",
    modified: "2026-01-01T00:00:00Z",
    disabled: false,
    disable_index: false,
    enable_sign: false,
    order_by: "",
    order_direction: "",
    extract_folder: "",
    web_proxy: true,
    webdav_policy: "native_proxy",
    proxy_range: false,
    down_proxy_url: "",
    disable_proxy_sign: false,
    ...overrides,
  };
}

describe("storage payload helpers", () => {
  it("requires an intentional Local root while defaulting WebDAV to its remote root", () => {
    expect(emptyStorageForm("Local").rootFolderPath).toBe("");
    expect(emptyStorageForm("WebDav").rootFolderPath).toBe("/");
  });

  it("normalizes mount paths without changing folder names", () => {
    expect(normalizeMountPath("  //Media/Photos/ ")).toBe("/Media/Photos");
  });

  it("builds the complete Local addition with secure explicit values", () => {
    const values = {
      ...emptyStorageForm("Local"),
      mountPath: "Local Media",
      rootFolderPath: "/data/media",
      thumbnail: false,
      showHidden: false,
    };
    const storage = storageFromForm(values);
    expect(storage).toMatchObject({
      mount_path: "/Local Media",
      driver: "Local",
      cache_expiration: 0,
      web_proxy: false,
      webdav_policy: "native_proxy",
    });
    expect(storage).not.toHaveProperty("modified");
    expect(JSON.parse(storage.addition)).toMatchObject({
      root_folder_path: "/data/media",
      thumbnail: false,
      show_hidden: false,
      thumb_concurrency: "16",
      mkdir_perm: "777",
    });
  });

  it("round trips WebDAV credentials while preserving unknown backend options", () => {
    const existing = existingStorage();
    const values = storageToForm(existing);
    values.address = "https://new.example.com/";
    values.order = 5;
    const storage = storageFromForm(values, existing);
    expect(storage.id).toBe(7);
    expect(storage.order).toBe(5);
    expect(JSON.parse(storage.addition)).toMatchObject({
      address: "https://new.example.com",
      password: "secret",
      future_driver_option: "preserve-me",
    });
  });

  it("maps a remote OpenList token to its driver-specific addition schema", () => {
    const values = {
      ...emptyStorageForm("OpenList"),
      mountPath: "/Archive",
      address: "https://remote.example.com/",
      token: "remote-token",
      rootFolderPath: "/Shared",
    };
    const storage = storageFromForm(values);
    expect(storage.driver).toBe("OpenList");
    expect(JSON.parse(storage.addition)).toMatchObject({
      url: "https://remote.example.com",
      token: "remote-token",
      root_folder_path: "/Shared",
      pass_refresh_flag_to_upsteam: false,
    });
  });

  it("classifies working, disabled, and failed storage states", () => {
    expect(storageStatus(existingStorage()).label).toBe("Connected");
    expect(storageStatus(existingStorage({ disabled: true })).label).toBe("Disabled");
    expect(storageStatus(existingStorage({ status: "connection refused" })).tone).toBe("danger");
  });
});
