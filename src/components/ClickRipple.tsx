import { useEffect } from "react";

/** Adds a lightweight, click-position ripple without forcing every control to own animation state. */
export function ClickRipple() {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-ripple='off']")) return;
      const ripple = document.createElement("span");
      ripple.className = `click-ripple${target?.closest("button, a") ? " click-ripple--control" : ""}`;
      ripple.style.left = `${event.clientX}px`;
      ripple.style.top = `${event.clientY}px`;
      document.body.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
    };

    document.addEventListener("pointerdown", handlePointerDown, { passive: true });
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return null;
}
