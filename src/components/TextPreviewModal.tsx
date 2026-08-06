import { useEffect, useState, type ReactNode } from "react";
import { Download, FileText, LoaderCircle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getToken } from "../lib/api";
import type { DocumentPreviewKind } from "../lib/files";
import { useDialogAnimation } from "../hooks/useDialogAnimation";

interface TextPreviewModalProps {
  name: string;
  source: string;
  downloadSource?: string;
  kind: DocumentPreviewKind;
  onClose: () => void;
}

export function TextPreviewModal({ name, source, downloadSource = source, kind, onClose }: TextPreviewModalProps) {
  const { t } = useTranslation();
  const { closing, close } = useDialogAnimation(onClose);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(kind !== "pdf");
  const [error, setError] = useState("");
  const [pdfSource, setPdfSource] = useState(source);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close]);

  useEffect(() => {
    setPdfSource(source);
  }, [source]);

  useEffect(() => {
    if (kind !== "pdf" || downloadSource === source) return;
    const controller = new AbortController();
    const headers = new Headers();
    const token = getToken();
    if (token) headers.set("Authorization", token);
    fetch(source, { method: "HEAD", credentials: "include", signal: controller.signal, headers })
      .then((response) => {
        if (!response.ok) setPdfSource(downloadSource);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPdfSource(downloadSource);
      });
    return () => controller.abort();
  }, [downloadSource, kind, source]);

  useEffect(() => {
    if (kind === "pdf") return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setContent("");
    const headers = new Headers({ Accept: "text/plain" });
    const token = getToken();
    if (token) headers.set("Authorization", token);
    const readSource = (url: string) => fetch(url, { credentials: "include", signal: controller.signal, headers }).then((response) => {
      if (!response.ok) throw new Error(`Preview request failed with status ${response.status}.`);
      const contentType = response.headers.get("content-type")?.toLowerCase() || "";
      if (contentType.includes("text/html")) throw new Error("Preview endpoint returned the frontend page instead of the file.");
      return response.text();
    });
    readSource(source)
      .catch((reason: unknown) => {
        const canFallback = reason instanceof Error && (reason.message.includes("status 404") || reason.message.includes("frontend page"));
        if (downloadSource === source || !canFallback) throw reason;
        return readSource(downloadSource);
      })
      .then(setContent)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : t("preview.unavailable"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [downloadSource, kind, source, t]);

  const label = t(`preview.${kind}`);
  return (
    <div className={`text-preview-modal${closing ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-labelledby="text-preview-title">
      <header className="text-preview-modal__header">
        <div className="text-preview-modal__identity">
          <span className="dialog__icon"><FileText size={21} /></span>
          <div><strong id="text-preview-title">{name}</strong><small>{label}</small></div>
        </div>
        <div className="text-preview-modal__actions">
          <a className="overlay-button" href={downloadSource} download={name} rel="noopener" title={t("preview.download")}><Download size={19} /></a>
          <button className="overlay-button" onClick={close} disabled={closing} title={t("common.close")} aria-label={t("common.close")}><X size={22} /></button>
        </div>
      </header>
      <div className={`text-preview-modal__body text-preview-modal__body--${kind}`}>
        {kind === "pdf" ? (
          <iframe className="text-preview-modal__pdf" src={pdfSource} title={`${name} ${label}`} onError={() => setPdfSource(downloadSource)} />
        ) : loading ? (
          <div className="text-preview-modal__status"><LoaderCircle className="spin" size={30} /><span>{t("preview.loading")}</span></div>
        ) : error ? (
          <div className="text-preview-modal__status text-preview-modal__status--error"><FileText size={30} /><span>{error}</span></div>
        ) : kind === "markdown" ? (
          <MarkdownPreview content={content} />
        ) : (
          <pre className="text-preview-modal__plain">{content}</pre>
        )}
      </div>
    </div>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let unordered: string[] = [];
  let ordered: string[] = [];
  let code: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(<p key={`paragraph-${blocks.length}`}>{renderInline(paragraph.join(" "))}</p>);
      paragraph = [];
    }
  };
  const flushLists = () => {
    if (unordered.length > 0) {
      blocks.push(<ul key={`unordered-${blocks.length}`}>{unordered.map((item, index) => <li key={`${index}-${item}`}>{renderInline(item)}</li>)}</ul>);
      unordered = [];
    }
    if (ordered.length > 0) {
      blocks.push(<ol key={`ordered-${blocks.length}`}>{ordered.map((item, index) => <li key={`${index}-${item}`}>{renderInline(item)}</li>)}</ol>);
      ordered = [];
    }
  };
  const flushText = () => {
    flushParagraph();
    flushLists();
  };

  lines.forEach((line, index) => {
    if (code !== null) {
      if (/^\s*```/.test(line)) {
        blocks.push(<pre className="text-preview-modal__code" key={`code-${index}`}><code>{code.join("\n")}</code></pre>);
        code = null;
      } else {
        code.push(line);
      }
      return;
    }
    if (/^\s*```/.test(line)) {
      flushText();
      code = [];
      return;
    }
    if (!line.trim()) {
      flushText();
      return;
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushText();
      const level = heading[1].length;
      const title = renderInline(heading[2]);
      if (level === 1) blocks.push(<h1 key={`heading-${index}`}>{title}</h1>);
      else if (level === 2) blocks.push(<h2 key={`heading-${index}`}>{title}</h2>);
      else if (level === 3) blocks.push(<h3 key={`heading-${index}`}>{title}</h3>);
      else blocks.push(<h4 key={`heading-${index}`}>{title}</h4>);
      return;
    }
    const unorderedItem = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unorderedItem) {
      flushParagraph();
      if (ordered.length > 0) flushLists();
      unordered.push(unorderedItem[1]);
      return;
    }
    const orderedItem = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (orderedItem) {
      flushParagraph();
      if (unordered.length > 0) flushLists();
      ordered.push(orderedItem[1]);
      return;
    }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushText();
      blocks.push(<blockquote key={`quote-${index}`}>{renderInline(quote[1])}</blockquote>);
      return;
    }
    flushLists();
    paragraph.push(line.trim());
  });
  const trailingCode = code as string[] | null;
  if (trailingCode !== null) blocks.push(<pre className="text-preview-modal__code" key="unterminated-code"><code>{trailingCode.join("\n")}</code></pre>);
  flushText();
  return <article className="text-preview-modal__markdown">{blocks}</article>;
}

function renderInline(value: string): ReactNode[] {
  const tokens = value.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g);
  return tokens.map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**")) return <strong key={index}>{token.slice(2, -2)}</strong>;
    if (token.startsWith("__") && token.endsWith("__")) return <strong key={index}>{token.slice(2, -2)}</strong>;
    if (token.startsWith("`") && token.endsWith("`")) return <code key={index}>{token.slice(1, -1)}</code>;
    const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return <span key={index}>{token}</span>;
  });
}
