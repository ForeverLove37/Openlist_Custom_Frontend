import { useEffect, useMemo, useState } from "react";
import { CalendarDays, FolderOpen, LoaderCircle, Search, SlidersHorizontal, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ApiError, getFile, searchFiles } from "../lib/api";
import { formatDate, formatSize, getFileKind, joinPath } from "../lib/files";
import type { SearchResult } from "../lib/types";
import { FileIcon } from "./FileIcon";

type SearchType = "all" | "folder" | "image" | "video" | "document" | "audio" | "archive" | "file";

interface SearchFilters {
  name: string;
  type: SearchType;
  location: string;
  modifiedFrom: string;
  modifiedTo: string;
  minimumSize: string;
  maximumSize: string;
}

interface AdvancedSearchProps {
  initialLocation: string;
  passwordForPath: (path: string) => string;
  onClose: () => void;
  onNavigate: (path: string) => void;
}

function initialFilters(location: string): SearchFilters {
  return { name: "", type: "all", location, modifiedFrom: "", modifiedTo: "", minimumSize: "", maximumSize: "" };
}

function toBytes(value: string) {
  const size = Number(value);
  return Number.isFinite(size) && size >= 0 ? size * 1024 * 1024 : null;
}

function isWithinDate(value: string | undefined, from: string, to: string) {
  if (!from && !to) return true;
  const time = new Date(value ?? "").getTime();
  if (!Number.isFinite(time)) return false;
  if (from && time < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && time >= new Date(`${to}T00:00:00`).getTime() + 86_400_000) return false;
  return true;
}

function resultKind(result: SearchResult) {
  return getFileKind({ name: result.name, is_dir: result.is_dir });
}

export function AdvancedSearch({ initialLocation, passwordForPath, onClose, onNavigate }: AdvancedSearchProps) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<SearchFilters>(() => initialFilters(initialLocation));
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setFilters((current) => current.location === initialLocation ? current : { ...current, location: initialLocation });
  }, [initialLocation]);

  const sizeError = useMemo(() => {
    const minimum = toBytes(filters.minimumSize);
    const maximum = toBytes(filters.maximumSize);
    return minimum !== null && maximum !== null && minimum > maximum;
  }, [filters.maximumSize, filters.minimumSize]);

  const update = (key: keyof SearchFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const reset = () => {
    setFilters(initialFilters(initialLocation));
    setResults([]);
    setSearched(false);
    setError("");
  };
  const search = async () => {
    if (sizeError) return;
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const location = filters.location.trim() || "/";
      const scope = filters.type === "folder" ? 1 : filters.type === "all" ? 0 : 2;
      const page = await searchFiles({
        parent: location,
        keywords: filters.name.trim(),
        scope,
        page: 1,
        perPage: 100,
        password: passwordForPath(location),
      });
      let matches = page.content ?? [];
      const minimum = toBytes(filters.minimumSize);
      const maximum = toBytes(filters.maximumSize);
      matches = matches.filter((result) => {
        const kind = resultKind(result);
        return (filters.type === "all" || kind === filters.type)
          && (minimum === null || result.size >= minimum)
          && (maximum === null || result.size <= maximum);
      });
      if (filters.modifiedFrom || filters.modifiedTo) {
        matches = (await Promise.all(matches.map(async (result) => {
          try {
            const detail = await getFile(joinPath(result.parent, result.name), passwordForPath(result.parent));
            return { ...result, modified: detail.modified, created: detail.created };
          } catch {
            return result;
          }
        }))).filter((result) => isWithinDate(result.modified, filters.modifiedFrom, filters.modifiedTo));
      }
      setResults(matches);
    } catch (reason) {
      setResults([]);
      setError(reason instanceof ApiError ? reason.message : "Could not search the OpenList index.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dialog-backdrop advanced-search-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="dialog advanced-search" role="dialog" aria-modal="true" aria-labelledby="advanced-search-title">
        <button className="icon-button dialog__close" onClick={onClose} title={t("common.close")}><X size={20} /></button>
        <div className="dialog__icon"><SlidersHorizontal size={22} /></div>
        <h2 id="advanced-search-title">{t("search.title")}</h2>
        <p>{t("search.description")}</p>
        <form onSubmit={(event) => { event.preventDefault(); void search(); }}>
          <div className="advanced-search__fields">
            <label>{t("search.name")}<input value={filters.name} onChange={(event) => update("name", event.target.value)} autoFocus /></label>
            <label>{t("search.type")}<select value={filters.type} onChange={(event) => update("type", event.target.value)}>
              {(["all", "folder", "image", "video", "document", "audio", "archive", "file"] as SearchType[]).map((type) => <option value={type} key={type}>{t(`search.${type === "file" ? "other" : type}`)}</option>)}
            </select></label>
            <label className="advanced-search__wide">{t("search.location")}<input value={filters.location} onChange={(event) => update("location", event.target.value)} placeholder="/" /></label>
            <fieldset className="advanced-search__wide">
              <legend><CalendarDays size={15} /> {t("search.modified")}</legend>
              <label>{t("search.from")}<input type="date" value={filters.modifiedFrom} onChange={(event) => update("modifiedFrom", event.target.value)} /></label>
              <label>{t("search.to")}<input type="date" value={filters.modifiedTo} onChange={(event) => update("modifiedTo", event.target.value)} /></label>
            </fieldset>
            <fieldset className="advanced-search__wide">
              <legend>{t("search.size")} <small>MiB</small></legend>
              <label>{t("search.minimum")}<input type="number" min="0" step="0.1" value={filters.minimumSize} onChange={(event) => update("minimumSize", event.target.value)} /></label>
              <label>{t("search.maximum")}<input type="number" min="0" step="0.1" value={filters.maximumSize} onChange={(event) => update("maximumSize", event.target.value)} /></label>
            </fieldset>
          </div>
          {sizeError && <div className="form-error">{t("search.minimum")} cannot be greater than {t("search.maximum")}.</div>}
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="file-dialog__actions"><button className="secondary-button" type="button" onClick={reset}>{t("search.reset")}</button><button className="primary-button" type="submit" disabled={loading || sizeError}>{loading ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}{t("search.run")}</button></div>
        </form>
        {searched && !loading && <div className="advanced-search__results" aria-live="polite">
          <div className="advanced-search__result-summary">{t("search.resultCount", { count: results.length })}</div>
          {results.length === 0 ? <div className="advanced-search__empty"><FolderOpen size={24} />{t("search.noResults")}</div> : results.map((result) => (
            <button className="advanced-search__result" key={`${result.parent}/${result.name}`} onClick={() => { onNavigate(result.is_dir ? joinPath(result.parent, result.name) : result.parent); onClose(); }}>
              <FileIcon item={{ name: result.name, is_dir: result.is_dir }} size={19} />
              <span><strong>{result.name}</strong><small>{result.parent}</small></span>
              <span className="advanced-search__result-meta">{result.is_dir ? t("search.folder") : formatSize(result.size)}<small>{result.modified ? formatDate(result.modified) : t("search.openLocation")}</small></span>
            </button>
          ))}
        </div>}
      </section>
    </div>
  );
}
