"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "./Button";
import { cn } from "../utils";

/**
 * Modern, reusable confirmation dialog: soft dimmed + blurred overlay, a rounded
 * card with a tinted icon, a clear title, a short message and two actions (a
 * subtle Cancel + a clear confirm). `tone="danger"` colours the icon/confirm for
 * destructive actions (e.g. logout, delete). Esc or backdrop click cancels.
 */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  loading = false,
  icon,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  loading?: boolean;
  icon?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={() => !loading && onCancel()}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-drawer animate-pop"
      >
        {icon && (
          <div
            className={cn(
              "mb-4 flex h-12 w-12 items-center justify-center rounded-full",
              tone === "danger" ? "bg-coral-tile text-coral-text" : "bg-brand-50 text-brand-600",
            )}
          >
            {icon}
          </div>
        )}
        <h2 id="confirm-title" className="font-heading text-lg font-semibold text-text-primary">
          {title}
        </h2>
        {message && <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">{message}</p>}
        <div className="mt-6 flex justify-end gap-2.5">
          <Button variant="ghost" disabled={loading} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} disabled={loading} onClick={onConfirm}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />} {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
