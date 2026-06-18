"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { logError } from "@/lib/log";

// Route-level error boundary for every admin screen: a friendly message + retry
// instead of a crash. Errors are reported through the central log sink.
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { logError(error, { digest: error.digest, where: "admin-route" }); }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-card">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-coral-tile text-coral-icon">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="font-heading text-lg font-semibold text-text-primary">Something went wrong</h2>
        <p className="mt-1 text-sm text-text-secondary">
          This screen hit an error. You can retry — your data is safe.
        </p>
        <Button onClick={reset} className="mt-4 w-full">
          <RotateCcw className="h-4 w-4" /> Try again
        </Button>
      </div>
    </div>
  );
}
