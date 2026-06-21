"use client";

import { useEffect, useRef } from "react";

// Global hardware-scanner capture for USB/Bluetooth keyboard-wedge scanners.
//
// A wedge scanner "types" the barcode as a very fast keystroke burst, usually
// ending in Enter (sometimes Tab, sometimes nothing). We tell a scan apart from
// human typing purely by TIMING: characters of one barcode arrive only a few ms
// apart, far faster than any person types. So:
//
//   • capture keydown at the document level (capture phase, before React),
//   • buffer characters whose inter-key gap is under ~35ms (machine speed),
//   • flush the buffer as a scan on Enter/Tab OR after ~70ms of inactivity,
//   • slow (human) typing keeps resetting the buffer and never flushes.
//
// It works EVEN when a text input is focused: once a burst is detected we
// preventDefault the keys so the digits don't land in the field, route the code
// to the scan handler, and clean up the one character that may have leaked in
// before we were sure it was a scan. The cashier never has to click off a field.
//
// Dedicated barcode-entry boxes (Add Product barcode, variant pickers, …) opt
// OUT with `data-scan-input` so a scan there fills the field as intended.

const BURST_GAP_MS = 35; // max gap between two keys within one scanner burst
const FLUSH_IDLE_MS = 70; // flush a buffered burst this long after the last key
const MIN_SCAN_LENGTH = 3; // shorter "bursts" are never treated as a barcode
const DEDUP_MS = 300; // drop an identical code re-received within this window

/** Strip CR/LF/Tab and surrounding whitespace the scanner may add. */
export function normalizeScan(raw: string): string {
  return raw.replace(/[\r\n\t]+/g, "").trim();
}

/** A field that should RECEIVE the scan itself (barcode box / variant picker). */
function isScanTarget(el: Element | null): boolean {
  return !!el && typeof (el as HTMLElement).hasAttribute === "function" && (el as HTMLElement).hasAttribute("data-scan-input");
}

function isTypingField(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

/** React-aware value setter so controlled inputs see a programmatic change. */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Remove the character(s) that leaked into a focused field before we detected the burst. */
function stripLeaked(leaked: string) {
  if (!leaked) return;
  const el = document.activeElement;
  if (!isTypingField(el)) return;
  const input = el as HTMLInputElement;
  if (input.value.endsWith(leaked)) {
    setNativeValue(input, input.value.slice(0, input.value.length - leaked.length));
  }
}

export function useHardwareScanner(
  onScan: (code: string) => void,
  opts: { enabled?: boolean } = {},
) {
  const { enabled = true } = opts;
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    let buffer = "";
    let leaked = ""; // chars we let land in a focused field this burst
    let fast = false; // did the buffer arrive at machine speed?
    let lastTs = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastCode = "";
    let lastCodeAt = 0;

    const reset = () => {
      buffer = "";
      leaked = "";
      fast = false;
      if (timer) { clearTimeout(timer); timer = null; }
    };

    const flush = () => {
      const raw = buffer;
      const hadLeak = leaked;
      const wasFast = fast;
      reset();
      if (!wasFast || raw.length < MIN_SCAN_LENGTH) return;
      const code = normalizeScan(raw);
      if (!code) return;
      const now = performance.now();
      // Always clean the leaked char out of the focused field, even on dedup.
      stripLeaked(hadLeak);
      if (code === lastCode && now - lastCodeAt < DEDUP_MS) return; // ignore double-fire
      lastCode = code;
      lastCodeAt = now;
      onScanRef.current(code);
    };

    const scheduleIdleFlush = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (fast && buffer.length >= MIN_SCAN_LENGTH) flush();
        else reset();
      }, FLUSH_IDLE_MS);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Let dedicated barcode/variant fields capture the scan themselves.
      if (isScanTarget(document.activeElement)) { reset(); return; }

      const now = performance.now();

      // Terminators — a wedge scanner usually ends the burst with Enter (or Tab).
      if (e.key === "Enter" || e.key === "Tab") {
        if (fast && buffer.length >= MIN_SCAN_LENGTH) {
          e.preventDefault();
          e.stopPropagation();
          flush();
        } else {
          reset();
        }
        return;
      }

      if (e.key.length !== 1) return; // Shift / arrows / F-keys etc.

      const gap = now - lastTs;
      lastTs = now;

      if (buffer === "" || gap > BURST_GAP_MS) {
        // Start of a sequence, or a human-speed gap: this char may belong to a
        // person typing, so let it land for now — we only consume confirmed bursts.
        buffer = e.key;
        leaked = isTypingField(document.activeElement) ? e.key : "";
        fast = false;
      } else {
        // Machine-speed continuation: this is a scan — keep it out of any field.
        buffer += e.key;
        fast = true;
        e.preventDefault();
        e.stopPropagation();
      }
      scheduleIdleFlush();
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      reset();
    };
  }, [enabled]);
}
