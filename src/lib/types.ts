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
}

export interface LoginResult {
  token: string;
}

export type ViewMode = "grid" | "list";
export type SortKey = "name" | "modified" | "size";
export type SortDirection = "asc" | "desc";
