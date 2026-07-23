import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, listDirectory } from "../lib/api";
import type { DirectoryData } from "../lib/types";

const emptyDirectory: DirectoryData = {
  content: [],
  total: 0,
  readme: "",
  header: "",
  provider: "",
};

export function useDirectory(path: string, password: string) {
  const [data, setData] = useState<DirectoryData>(emptyDirectory);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [revision, setRevision] = useState(0);
  const requestId = useRef(0);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    listDirectory(path, password, controller.signal)
      .then((result) => {
        if (requestId.current === id) setData({ ...result, content: result.content ?? [] });
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
  }, [path, password, revision]);

  return { data, loading, error, refresh };
}
