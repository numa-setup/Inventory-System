"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { cn } from "../utils";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastCtx = createContext<(message: string, kind?: ToastKind) => void>(
  () => {},
);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, kind: ToastKind = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-center gap-3 rounded-xl border bg-surface px-4 py-3 shadow-card-hover animate-slide-up",
              t.kind === "success" && "border-green-tile",
              t.kind === "error" && "border-coral-tile",
              t.kind === "info" && "border-blue-tile",
            )}
          >
            {t.kind === "success" && <CheckCircle2 className="h-5 w-5 text-green-icon" />}
            {t.kind === "error" && <XCircle className="h-5 w-5 text-coral-icon" />}
            {t.kind === "info" && <Info className="h-5 w-5 text-blue-icon" />}
            <span className="flex-1 text-sm text-text-primary">{t.message}</span>
            <button
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              className="text-text-tertiary hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
