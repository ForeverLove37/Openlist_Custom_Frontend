import type { OpenListStorage, StorageDriver, StorageFormValues } from "./types";

const baseStorage: OpenListStorage = {
  id: 0,
  mount_path: "",
  order: 0,
  driver: "Local",
  cache_expiration: 0,
  custom_cache_policies: "",
  status: "",
  addition: "{}",
  remark: "",
  modified: "",
  disabled: false,
  disable_index: false,
  enable_sign: false,
  order_by: "",
  order_direction: "",
  extract_folder: "",
  web_proxy: false,
  webdav_policy: "native_proxy",
  proxy_range: false,
  down_proxy_url: "",
  disable_proxy_sign: false,
};

const localAdditionDefaults = {
  root_folder_path: "/",
  directory_size: false,
  thumbnail: true,
  thumb_cache_folder: "",
  thumb_concurrency: "16",
  video_thumb_pos: "20%",
  show_hidden: true,
  mkdir_perm: "777",
  recycle_bin_path: "delete permanently",
};

const webDavAdditionDefaults = {
  vendor: "other",
  address: "",
  username: "",
  password: "",
  root_folder_path: "/",
  tls_insecure_skip_verify: false,
};

function parseAddition(storage?: OpenListStorage): Record<string, unknown> {
  if (!storage?.addition) return {};
  try {
    const parsed = JSON.parse(storage.addition) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function normalizeMountPath(path: string) {
  const parts = path.trim().split("/").filter(Boolean);
  return parts.length ? `/${parts.join("/")}` : "/";
}

export function emptyStorageForm(driver: StorageDriver = "Local"): StorageFormValues {
  return {
    driver,
    mountPath: "",
    order: 0,
    remark: "",
    rootFolderPath: driver === "WebDav" ? "/" : "",
    thumbnail: true,
    showHidden: true,
    address: "",
    username: "",
    password: "",
    tlsInsecureSkipVerify: false,
  };
}

export function storageToForm(storage: OpenListStorage): StorageFormValues {
  const driver: StorageDriver = storage.driver === "WebDav" ? "WebDav" : "Local";
  const addition = parseAddition(storage);
  return {
    driver,
    mountPath: storage.mount_path,
    order: storage.order,
    remark: storage.remark ?? "",
    rootFolderPath: String(addition.root_folder_path ?? "/"),
    thumbnail: Boolean(addition.thumbnail ?? true),
    showHidden: Boolean(addition.show_hidden ?? true),
    address: String(addition.address ?? ""),
    username: String(addition.username ?? ""),
    password: String(addition.password ?? ""),
    tlsInsecureSkipVerify: Boolean(addition.tls_insecure_skip_verify ?? false),
  };
}

export function storageFromForm(values: StorageFormValues, existing?: OpenListStorage): OpenListStorage {
  const previousAddition = parseAddition(existing);
  const isLocal = values.driver === "Local";
  const addition = isLocal
    ? {
        ...localAdditionDefaults,
        ...previousAddition,
        root_folder_path: values.rootFolderPath.trim() || "/",
        thumbnail: values.thumbnail,
        show_hidden: values.showHidden,
      }
    : {
        ...webDavAdditionDefaults,
        ...previousAddition,
        address: values.address.trim().replace(/\/$/, ""),
        username: values.username.trim(),
        password: values.password,
        root_folder_path: values.rootFolderPath.trim() || "/",
        tls_insecure_skip_verify: values.tlsInsecureSkipVerify,
      };

  return {
    ...baseStorage,
    ...existing,
    id: existing?.id ?? 0,
    mount_path: normalizeMountPath(values.mountPath),
    order: Number.isFinite(values.order) ? values.order : 0,
    driver: values.driver,
    cache_expiration: isLocal ? 0 : (existing?.cache_expiration || 30),
    web_proxy: isLocal ? false : (existing?.web_proxy ?? true),
    webdav_policy: "native_proxy",
    remark: values.remark.trim(),
    addition: JSON.stringify(addition),
  };
}

export function storageStatus(storage: OpenListStorage) {
  if (storage.disabled) return { label: "Disabled", tone: "neutral" as const };
  if (storage.status === "work") return { label: "Connected", tone: "success" as const };
  if (!storage.status) return { label: "Starting", tone: "warning" as const };
  return { label: "Error", tone: "danger" as const };
}
