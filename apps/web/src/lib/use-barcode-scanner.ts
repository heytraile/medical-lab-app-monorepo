import { useCallback, useEffect, useRef } from "react";

const SCAN_GAP_MS = 40;
const MIN_SCAN_LENGTH = 4;

type Options = {
  /** Called when a wedge scan is detected (fast keystrokes + Enter). */
  onScan: (value: string) => void;
  /** When false, ignore input (default true). */
  enabled?: boolean;
};

/**
 * Honeywell USB HID keyboard wedge: scans arrive as rapid keypresses terminated by Enter.
 */
export function useBarcodeScanner({ onScan, enabled = true }: Options) {
  const bufferRef = useRef("");
  const lastKeyAtRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const flush = useCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed.length >= MIN_SCAN_LENGTH) {
      onScanRef.current(trimmed);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const now = Date.now();
      if (now - lastKeyAtRef.current > SCAN_GAP_MS) {
        bufferRef.current = "";
      }
      lastKeyAtRef.current = now;

      if (e.key === "Enter") {
        flush(bufferRef.current);
        bufferRef.current = "";
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, flush]);
}

/** Enter in a focused input completes a wedge scan (rapid typing + Enter). */
export function useScanInput(onScan: (value: string) => void) {
  return {
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const v = e.currentTarget.value.trim();
        if (v.length >= MIN_SCAN_LENGTH) {
          onScan(v);
        }
      }
    },
  };
}
