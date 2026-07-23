import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, LoaderCircle, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { ApiError, getFile } from "../lib/api";
import { joinPath } from "../lib/files";
import type { OpenListItem } from "../lib/types";

interface GalleryProps {
  images: OpenListItem[];
  initialIndex: number;
  directoryPath: string;
  password: string;
  onClose: () => void;
}

interface Position { x: number; y: number }

export function Gallery({ images, initialIndex, directoryPath, password, onClose }: GalleryProps) {
  const [index, setIndex] = useState(initialIndex);
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const drag = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const image = images[index];

  const previous = useCallback(() => setIndex((value) => (value - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setIndex((value) => (value + 1) % images.length), [images.length]);
  const resetTransform = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSource("");
    resetTransform();
    getFile(joinPath(directoryPath, image.name), password, controller.signal)
      .then((detail) => setSource(detail.raw_url))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof ApiError ? reason.message : "Could not load this image.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [directoryPath, image.name, password, resetTransform]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && images.length > 1) previous();
      if (event.key === "ArrowRight" && images.length > 1) next();
      if (event.key === "+" || event.key === "=") setScale((value) => Math.min(5, value + 0.25));
      if (event.key === "-") setScale((value) => Math.max(1, value - 0.25));
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [images.length, next, onClose, previous]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  const zoom = (amount: number) => {
    setScale((value) => {
      const updated = Math.max(1, Math.min(5, value + amount));
      if (updated === 1) setPosition({ x: 0, y: 0 });
      return updated;
    });
  };

  return (
    <div className="gallery" role="dialog" aria-modal="true" aria-label={`Image preview: ${image.name}`}>
      <div className="gallery__topbar">
        <div className="gallery__identity">
          <strong>{image.name}</strong>
          <span>{index + 1} of {images.length}</span>
        </div>
        <div className="gallery__tools">
          <button className="overlay-button" onClick={() => zoom(-0.25)} disabled={scale <= 1} title="Zoom out"><ZoomOut size={20} /></button>
          <button className="overlay-button" onClick={() => zoom(0.25)} disabled={scale >= 5} title="Zoom in"><ZoomIn size={20} /></button>
          <button className="overlay-button" onClick={resetTransform} disabled={scale === 1} title="Reset zoom"><RotateCcw size={20} /></button>
          {source && <a className="overlay-button" href={source} download={image.name} title="Download image"><Download size={20} /></a>}
          <button className="overlay-button" onClick={onClose} title="Close preview"><X size={22} /></button>
        </div>
      </div>

      <div
        className={`gallery__stage${scale > 1 ? " gallery__stage--zoomed" : ""}`}
        onWheel={(event) => { event.preventDefault(); zoom(event.deltaY > 0 ? -0.25 : 0.25); }}
        onPointerDown={(event) => {
          if (scale <= 1) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          setPosition({
            x: drag.current.originX + event.clientX - drag.current.startX,
            y: drag.current.originY + event.clientY - drag.current.startY,
          });
        }}
        onPointerUp={() => { drag.current = null; }}
      >
        {loading && <div className="gallery__status"><LoaderCircle className="spin" size={34} /><span>Loading original</span></div>}
        {error && <div className="gallery__status gallery__status--error"><ImageOffIcon /><span>{error}</span></div>}
        {source && (
          <img
            className="gallery__image"
            src={source}
            alt={image.name}
            draggable={false}
            style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})` }}
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setError("The image could not be displayed."); }}
          />
        )}
      </div>

      {images.length > 1 && (
        <>
          <button className="gallery__nav gallery__nav--previous" onClick={previous} title="Previous image"><ChevronLeft size={30} /></button>
          <button className="gallery__nav gallery__nav--next" onClick={next} title="Next image"><ChevronRight size={30} /></button>
        </>
      )}
    </div>
  );
}

function ImageOffIcon() {
  return <span className="gallery__error-mark" aria-hidden="true">!</span>;
}
