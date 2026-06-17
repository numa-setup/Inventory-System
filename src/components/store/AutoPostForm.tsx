"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

/** Auto-submits a signed POST form to the payment gateway's hosted checkout. */
export function AutoPostForm({ action, fields, note }: { action: string; fields: Record<string, string>; note?: string }) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.submit(), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-5 py-24 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-store-muted" />
      <h1 className="mt-5 font-serif text-2xl text-store-ink">Redirecting to secure payment…</h1>
      <p className="mt-2 text-sm text-store-muted">{note ?? "Please don’t close this window."}</p>
      <form ref={ref} action={action} method="POST" className="mt-6">
        {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <noscript>
          <button type="submit" className="bg-store-ink px-7 py-3.5 text-xs uppercase tracking-[0.18em] text-store-paper">Continue to payment</button>
        </noscript>
      </form>
    </div>
  );
}
