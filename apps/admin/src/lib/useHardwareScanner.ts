"use client";

import { useEffect, useRef } from "react";

// Global hardware-scanner capture for USB/Bluetooth keyboard-wedge scanners.
//
// A wedge scanner "types" the barcode as a very fast keystroke burst, usually
// ending in Enter (sometimes Tab, sometimes nothing). We tell a scan apart from
// human typing purely by TIMING: the characters of one barcode arrive only a few
// ms apart — far faster, and far more evenly, than any person types.
//
//   • capture keydown at the document level (capture phase, before React),
//   • accumulate characters; a gap > NEW_SEQUENCE_GAP starts a fresh sequence,
//   • on Enter/Tab (or after FLUSH_IDLE_MS of silence) decide by the AVERAGE
//     inter-key time whether the buffer was a scan, and if so route it.
//
// Using the average (not a hard per-key cutoff) makes it tolerant of a scanner
// that runs a little slower or jitters, while still rejecting human typing.
//
// It works EVEN when a text input is focused: characters arriving at machine
// speed are consumed (preventDefault) so they don't land in the field; the few
// that may leak in before we're sure are stripped back out on flush. The cashier
// never has to click off a field. Dedicated barcode boxes opt out via
// `data-scan-input` so a scan there fills the field as intended.

const CONSUME_GAP_MS = 55; // keep a key out of a focused field if it arrives this fast
const AVG_GAP_MS = 55; // a buffer whose mean inter-key gap is <= this is a scan
const NEW_SEQUENCE_GAP_MS = 200; // a longer pause starts a brand-new sequence
const FLUSH_IDLE_MS = 120; // flush a buffered burst this long after the last key
const MIN_SCAN_LENGTH = 6; // real barcodes are >=8 digits; 6 keeps fast-typed numbers safe
const DEDUP_MS = 300; // drop an identical code re-received within this window

/** Strip CR/LF/Tab and surrounding whitespace the scanner may add. */
export function normalizeScan(raw: string): string {
  return raw.replace(/[\r\n\t]+/g, "").trim();
}

function debugOn(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem("scanDebug") === "1";
  } catch {
    return false;
  }
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

/** Remove characters that leaked into a focused field before we detected the burst. */
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
    let firstTs = 0; // timestamp of the first char in the buffer
    let lastTs = 0; // timestamp of the most recent char
    let leaked = ""; // chars that landed in a focused field this burst
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastCode = "";
    let lastCodeAt = 0;

    const reset = () => {
      buffer = "";
      leaked = "";
      firstTs = 0;
      lastTs = 0;
      if (timer) { clearTimeout(timer); timer = null; }
    };

    // Mean gap between keys; 0 for a single char (treated as fast).
    const avgGap = () => (buffer.length > 1 ? (lastTs - firstTs) / (buffer.length - 1) : 0);
    const looksLikeScan = () => buffer.length >= MIN_SCAN_LENGTH && avgGap() <= AVG_GAP_MS;

    const flush = () => {
      const raw = buffer;
      const hadLeak = leaked;
      const mean = avgGap();
      reset();
      const code = normalizeScan(raw);
      if (!code) return;
      const now = performance.now();
      stripLeaked(hadLeak); // clean the field even if we end up deduping
      if (code === lastCode && now - lastCodeAt < DEDUP_MS) {
        if (debugOn()) console.info("[scan] dedup ignored", { code });
        return;
      }
      lastCode = code;
      lastCodeAt = now;
      if (debugOn()) console.info("[scan] ✓ scan", { raw, normalized: code, len: code.length, avgGapMs: Math.round(mean) });
      onScanRef.current(code);
    };

    const scheduleIdleFlush = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (looksLikeScan()) flush();
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
        if (looksLikeScan()) {
          e.preventDefault();
          e.stopPropagation();
          flush();
        } else {
          if (debugOn() && buffer.length >= MIN_SCAN_LENGTH) {
            console.info("[scan] ignored (looks like typing)", { buffer, len: buffer.length, avgGapMs: Math.round(avgGap()) });
          }
          reset();
        }
        return;
      }

      if (e.key.length !== 1) return; // Shift / arrows / F-keys etc.

      const gap = buffer === "" ? Infinity : now - lastTs;
      if (gap > NEW_SEQUENCE_GAP_MS) {
        // Long pause → this is the start of a new sequence.
        buffer = "";
        leaked = "";
        firstTs = now;
      }
      if (buffer === "") firstTs = now;
      lastTs = now;

      const machineSpeed = buffer !== "" && gap <= CONSUME_GAP_MS;
      buffer += e.key;
      if (machineSpeed) {
        // Confident this is a scan in progress → keep it out of any focused field.
        e.preventDefault();
        e.stopPropagation();
      } else if (isTypingField(document.activeElement)) {
        // Might be a person typing; let it land for now (cleaned up if it flushes).
        leaked += e.key;
      }
      if (debugOn()) console.debug("[scan] key", { key: e.key, gapMs: gap === Infinity ? "∞" : Math.round(gap), buffer });
      scheduleIdleFlush();
    };

    document.addEventListener("keydown", onKeyDown, true);
    if (debugOn()) console.info("[scan] hardware listener attached");
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      reset();
    };
  }, [enabled]);
}
