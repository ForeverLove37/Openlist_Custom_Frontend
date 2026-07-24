export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export interface OpenListItem {
  name: string;
  size: number;
  is_dir: boolean;
  modified: string;
  created: string;
  sign: string;
  thumb: string;
  type: number;
  hashinfo: string;
}

export interface DirectoryData {
  content: OpenListItem[] | null;
  total: number;
  readme: string;
  header: string;
  write: boolean;
  write_content_bypass: boolean;
  provider: string;
}

export interface FileDetail extends OpenListItem {
  raw_url: string;
  provider: string;
  related: OpenListItem[] | null;
}

export interface OpenListUser {
  id: number;
  username: string;
  role: number;
  disabled: boolean;
  base_path: string;
  permission: number;
  sso_id?: string;
  allow_ldap?: boolean;
}

export interface ManagedUser extends OpenListUser {
  password?: string;
}

export interface UserPage {
  content: ManagedUser[] | null;
  total: number;
}

export interface UserFormValues {
  username: string;
  password: string;
  basePath: string;
  permission: number;
  disabled: boolean;
  allowLdap: boolean;
}

export interface LoginResult {
  token: string;
}

export type StorageDriver = "Local" | "WebDav" | "OpenList" | "AList V3";

export interface OpenListStorage {
  id: number;
  mount_path: string;
  order: number;
  driver: string;
  cache_expiration: number;
  custom_cache_policies: string;
  status: string;
  addition: string;
  remark: string;
  modified?: string;
  disabled: boolean;
  disable_index: boolean;
  enable_sign: boolean;
  order_by: string;
  order_direction: string;
  extract_folder: string;
  web_proxy: boolean;
  webdav_policy: string;
  proxy_range: boolean;
  down_proxy_url: string;
  disable_proxy_sign: boolean;
  mount_details?: {
    total_space: number;
    used_space: number;
    free_space: number;
  };
}

export interface StoragePage {
  content: OpenListStorage[] | null;
  total: number;
}

export interface StorageFormValues {
  driver: StorageDriver;
  mountPath: string;
  order: number;
  remark: string;
  rootFolderPath: string;
  thumbnail: boolean;
  showHidden: boolean;
  address: string;
  username: string;
  password: string;
  tlsInsecureSkipVerify: boolean;
  token: string;
  webProxy: boolean;
  proxyRange: boolean;
}

export type ViewMode = "grid" | "list";
export type SortKey = "name" | "modified" | "size";
export type SortDirection = "asc" | "desc";
