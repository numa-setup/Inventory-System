"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { useHardwareScanner } from "@/lib/useHardwareScanner";
import { parseScan } from "@/lib/barcode";
import { ensureCatalog, lookupBarcodeLoose, type CatalogItem } from "@/lib/catalog-cache";
import { beepOk, beepError } from "@/lib/sound";
import { ScanActionSheet } from "./ScanActionSheet";
import { CameraScanner } from "./CameraScannerLazy";

type Handler = (code: string) => void;

interface ScanCtx {
  /** Register a screen-local scan handler; pass null to release. */
  register: (h: Handler | null) => void;
  /** Open the global camera scanner. */
  openCamera: () => void;
}

const Ctx = createContext<ScanCtx | null>(null);

/**
 * One coordinated scan layer for the whole admin app. A single hardware-wedge
 * listener lives here. Screens that want to own scans (POS, receiving) register
 * a handler via useScanHandler; when none is active, a scan resolves through the
 * cached catalogue and opens the global quick-action sheet ("scan anywhere").
 */
export function ScanProvider({ children }: { children: React.ReactNode }) {
  const handlerRef = useRef<Handler | null>(null);
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [lastScan, setLastScan] = useState<{ code: string; n: number } | null>(null);

  // Warm the catalogue cache so global scans resolve instantly.
  useEffect(() => { void ensureCatalog(); }, []);

  const resolveGlobal = useCallback((code: string) => {
    const parsed = parseScan(code);
    const hit = lookupBarcodeLoose(parsed.lookupKey) ?? lookupBarcodeLoose(parsed.barcode);
    if (hit) {
      beepOk();
      setUnknown(null);
      setItem(hit);
    } else {
      beepError();
      setItem(null);
      setUnknown(parsed.barcode);
    }
  }, []);

  const onScan = useCallback((code: string) => {
    setLastScan((s) => ({ code, n: (s?.n ?? 0) + 1 })); // visible confirmation a scan arrived
    const hasHandler = !!handlerRef.current;
    try {
      if (typeof window !== "undefined" && window.localStorage.getItem("scanDebug") === "1") {
        console.info("[scan] dispatch", { code, routedTo: hasHandler ? "screen handler" : "scan-anywhere sheet" });
      }
    } catch { /* ignore */ }
    if (handlerRef.current) handlerRef.current(code);
    else resolveGlobal(code);
  }, [resolveGlobal]);

  useHardwareScanner(onScan);

  const register = useCallback((h: Handler | null) => { handlerRef.current = h; }, []);
  const openCamera = useCallback(() => setCameraOpen(true), []);

  return (
    <Ctx.Provider value={{ register, openCamera }}>
      {children}
      <ScannerIndicator lastScan={lastScan} />
      <ScanActionSheet item={item} unknown={unknown} onClose={() => { setItem(null); setUnknown(null); }} />
      <CameraScanner
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onResult={(code) => { setCameraOpen(false); onScan(code); }}
        title="Scan anywhere"
      />
    </Ctx.Provider>
  );
}

/** Always-visible "listening" pill that flashes the captured code on each scan. */
function ScannerIndicator({ lastScan }: { lastScan: { code: string; n: number } | null }) {
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!lastScan) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1400);
    return () => clearTimeout(t);
  }, [lastScan]);
  return (
    <div
      className={
        "pointer-events-none fixed bottom-3 left-3 z-[60] flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-card transition-colors " +
        (flash
          ? "border-green-icon/40 bg-green-tile text-green-text"
          : "border-border bg-surface/90 text-text-tertiary backdrop-blur")
      }
      aria-live="polite"
    >
      <ScanLine className={"h-3.5 w-3.5 " + (flash ? "animate-pulse" : "")} />
      {flash && lastScan ? `Scanned ${lastScan.code}` : "Scanner ready"}
    </div>
  );
}

export function useScan(): ScanCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useScan must be used within ScanProvider");
  return c;
}

/**
 * Register a screen-local scan handler for as long as the component is mounted.
 * While registered, the global "scan anywhere" sheet is suppressed.
 */
export function useScanHandler(handler: Handler, enabled = true) {
  const { register } = useScan();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const stable: Handler = (code) => ref.current(code);
    register(stable);
    return () => register(null);
  }, [register, enabled]);
}
