"use client";

import Link from "next/link";
import { Smartphone, ShieldCheck } from "lucide-react";
import { formatPKR } from "@/lib/utils";

type Provider = "jazzcash" | "easypaisa";
const META: Record<Provider, { label: string }> = {
  jazzcash: { label: "JazzCash" },
  easypaisa: { label: "Easypaisa" },
};

export function GatewayChoice({
  order,
  options,
}: {
  order: { order_no: string; total: number };
  options: { provider: Provider; action: string; fields: Record<string, string> }[];
}) {
  return (
    <div className="mx-auto max-w-md px-5 py-12 lg:px-10">
      <h1 className="text-center font-serif text-4xl text-store-ink">Payment</h1>
      <p className="mt-2 text-center text-sm text-store-muted">Order {order.order_no}</p>

      <div className="mt-6 border border-store-line bg-store-paper p-6">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-store-charcoal">Amount due</span>
          <span className="font-serif text-2xl text-store-ink">{formatPKR(order.total)}</span>
        </div>

        <p className="mt-6 text-[11px] uppercase tracking-[0.15em] text-store-muted">Choose how to pay</p>
        <div className="mt-3 space-y-3">
          {options.map((o) => (
            <form key={o.provider} action={o.action} method="POST">
              {Object.entries(o.fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <button type="submit" className="flex w-full items-center justify-between gap-3 bg-store-ink px-4 py-3.5 text-store-paper transition-opacity hover:opacity-90">
                <span className="flex items-center gap-2 text-sm"><Smartphone className="h-4 w-4" /> Pay with {META[o.provider].label}</span>
                <span className="text-sm">{formatPKR(order.total)}</span>
              </button>
            </form>
          ))}
        </div>

        <p className="mt-4 flex items-center gap-1.5 text-xs text-store-muted">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> You’ll complete payment on the provider’s secure page.
        </p>
      </div>

      <Link href="/shop/checkout" className="mt-4 block text-center text-sm text-store-charcoal underline">Cancel and return to bag</Link>
    </div>
  );
}
