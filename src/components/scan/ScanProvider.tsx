"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useHardwareScanner } from "@/lib/useHardwareScanner";
import { parseScan } from "@/lib/barcode";
import { ensureCatalog, lookupByBarcode, type CatalogItem } from "@/lib/catalog-cache";
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

  // Warm the catalogue cache so global scans resolve instantly.
  useEffect(() => { void ensureCatalog(); }, []);

  const resolveGlobal = useCallback((code: string) => {
    const parsed = parseScan(code);
    const hit = lookupByBarcode(parsed.lookupKey) || lookupByBarcode(parsed.barcode);
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
    if (handlerRef.current) handlerRef.current(code);
    else resolveGlobal(code);
  }, [resolveGlobal]);

  useHardwareScanner(onScan);

  const register = useCallback((h: Handler | null) => { handlerRef.current = h; }, []);
  const openCamera = useCallback(() => setCameraOpen(true), []);

  return (
    <Ctx.Provider value={{ register, openCamera }}>
      {children}
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
