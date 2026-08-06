import { useCallback, useEffect, useRef, useState } from "react";

export const DIALOG_EXIT_DURATION = 220;

/** Keeps a dialog mounted long enough for its exit animation to finish. */
export function useDialogAnimation(onClose: () => void, duration = DIALOG_EXIT_DURATION) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const timer = useRef<number | null>(null);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      onClose();
    }, duration);
  }, [duration, onClose]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  return { closing, close };
}
