import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, listDirectory } from "../lib/api";
import type { DirectoryData } from "../lib/types";

const emptyDirectory: DirectoryData = {
  content: [],
  total: 0,
  readme: "",
  header: "",
  write: false,
  write_content_bypass: false,
  provider: "",
};

export function useDirectory(path: string, password: string, enabled = true) {
  const [data, setData] = useState<DirectoryData>(emptyDirectory);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [revision, setRevision] = useState(0);
  const [manualRefreshCount, setManualRefreshCount] = useState(0);
  const requestId = useRef(0);
  const forcedPath = useRef<string | null>(null);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const forceRefresh = useCallback(() => {
    forcedPath.current = path;
    setRevision((value) => value + 1);
  }, [path]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const id = ++requestId.current;
    const shouldForceRefresh = forcedPath.current === path;
    forcedPath.current = null;
    setLoading(true);
    setError(null);

    listDirectory(path, password, shouldForceRefresh, controller.signal)
      .then((result) => {
        if (requestId.current === id) {
          setData({ ...result, content: result.content ?? [] });
          if (shouldForceRefresh) setManualRefreshCount((value) => value + 1);
        }
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        if (requestId.current === id) {
          setError(reason instanceof ApiError ? reason : new ApiError("Unable to load this folder.", 0));
        }
      })
      .finally(() => {
        if (requestId.current === id) setLoading(false);
      });

    return () => controller.abort();
  }, [enabled, path, password, revision]);

  return { data, loading, error, refresh, forceRefresh, manualRefreshCount };
}
