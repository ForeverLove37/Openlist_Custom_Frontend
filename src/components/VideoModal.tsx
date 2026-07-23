import { useEffect, useRef } from "react";
import Artplayer from "artplayer";
import { X } from "lucide-react";

interface VideoModalProps {
  name: string;
  source: string;
  poster?: string;
  onClose: () => void;
}

export function VideoModal({ name, source, poster, onClose }: VideoModalProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    const player = new Artplayer({
      container: container.current,
      url: source,
      poster,
      volume: 0.7,
      autoplay: true,
      autoSize: false,
      autoMini: true,
      playbackRate: true,
      setting: true,
      pip: true,
      fullscreen: true,
      fullscreenWeb: true,
      mutex: true,
      theme: "#3b82f6",
      lang: navigator.language.toLowerCase(),
    });
    return () => player.destroy(false);
  }, [poster, source]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div className="video-modal" role="dialog" aria-modal="true" aria-label={`Video player: ${name}`}>
      <div className="video-modal__header">
        <strong>{name}</strong>
        <button className="overlay-button" onClick={onClose} title="Close player"><X size={22} /></button>
      </div>
      <div className="video-modal__player" ref={container} />
    </div>
  );
}
