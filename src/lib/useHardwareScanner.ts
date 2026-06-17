"use client";

import { useEffect, useRef } from "react";

// Global hardware-scanner capture (USB/Bluetooth keyboard-emulation, no driver).
// A scanner types a code as a fast keystroke burst ending in Enter. We buffer
// those keystrokes and, when the burst is fast enough and ends in Enter, fire
// onScan(code).
//
// Crucially this only acts when NO text field is focused — when the cashier is
// typing in the POS / receive search box, that field handles the scan itself
// (scanner types into it + Enter), so we never double-count.

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable
  );
}

export function useHardwareScanner(
  onScan: (code: string) => void,
  opts: { enabled?: boolean; minLength?: number; maxIntervalMs?: number } = {},
) {
  const { enabled = true, minLength = 3, maxIntervalMs = 60 } = opts;
  const buf = useRef("");
  const lastTs = useRef(0);
  const startTs = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Defer to focused fields — they capture their own scans.
      if (isEditable(document.activeElement)) return;

      const now = Date.now();
      if (e.key === "Enter") {
        const code = buf.current;
        const chars = code.length;
        const elapsed = now - startTs.current;
        buf.current = "";
        // Treat as a scan only if it was a fast burst of enough characters.
        if (chars >= minLength && (chars <= 1 || elapsed / chars <= maxIntervalMs)) {
          e.preventDefault();
          onScanRef.current(code);
        }
        return;
      }
      if (e.key.length !== 1) return; // ignore Shift/Tab/arrows/etc.

      if (now - lastTs.current > 300) {
        buf.current = ""; // long gap => start of a new (possibly human) sequence
        startTs.current = now;
      }
      buf.current += e.key;
      lastTs.current = now;
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, minLength, maxIntervalMs]);
}
