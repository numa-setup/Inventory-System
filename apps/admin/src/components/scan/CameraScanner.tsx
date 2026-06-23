"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { X, Camera, AlertTriangle } from "lucide-react";

/**
 * Phone/tablet camera scanner. Resolves a barcode through the same fast path as
 * hardware scans (the caller looks it up in the cached catalogue). In
 * `continuous` mode it keeps scanning (for receiving a whole delivery), ignoring
 * the same code fired twice within ~1.5s.
 */
export function CameraScanner({
  open,
  onClose,
  onResult,
  continuous = false,
  title = "Scan barcode",
}: {
  open: boolean;
  onClose: () => void;
  onResult: (code: string) => void;
  continuous?: boolean;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>();
  const lastRef = useRef<{ code: string; ts: number }>({ code: "", ts: 0 });

  useEffect(() => {
    if (!open) return;
    setError(undefined);
    const reader = new BrowserMultiFormatReader();
    let controls: IScannerControls | undefined;
    let stopped = false;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result, _err, ctrl) => {
        controls = ctrl;
        if (stopped || !result) return;
        const code = result.getText();
        const now = Date.now();
        if (code === lastRef.current.code && now - lastRef.current.ts < 1500) return;
        lastRef.current = { code, ts: now };
        onResult(code);
        if (!continuous) {
          stopped = true;
          ctrl.stop();
          onClose();
        }
      })
      .then((ctrl) => { controls = ctrl; })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Camera unavailable"));

    return () => {
      stopped = true;
      controls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, continuous]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="flex items-center gap-2 font-medium"><Camera className="h-5 w-5" /> {title}</span>
        <button onClick={onClose} className="rounded-lg p-2 hover:bg-white/10" aria-label="Close scanner">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <div className="flex max-w-xs flex-col items-center gap-2 px-6 text-center text-white">
            <AlertTriangle className="h-8 w-8 text-amber-400" />
            <p className="text-sm">{error}</p>
            <p className="text-xs text-white/60">Allow camera access, or use a hardware scanner / type the code.</p>
          </div>
        ) : (
          <>
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-40 w-72 max-w-[80vw] rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
            </div>
          </>
        )}
      </div>
      <p className="px-4 py-3 text-center text-xs text-white/70">
        {continuous ? "Keep scanning items — each adds a line." : "Point the camera at a barcode."}
      </p>
    </div>
  );
}
