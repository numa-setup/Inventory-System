"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "../utils";

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <div
        className="absolute inset-0 bg-black/40 animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "absolute inset-y-0 right-0 flex w-full flex-col bg-surface shadow-drawer animate-slide-in-right",
          width,
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="font-heading text-lg font-semibold text-text-primary">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-text-tertiary hover:bg-surface-2"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-5">
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-border px-5 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
