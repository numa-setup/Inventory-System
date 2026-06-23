"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Smartphone, Loader2, ShieldCheck, CheckCircle2 } from "lucide-react";
import { formatPKR } from "@hamza/shared/utils";
import { confirmOnlinePayment, type OnlineMethod } from "@/features/storefront/order-actions";

const METHODS: { id: OnlineMethod; label: string; Icon: typeof Smartphone }[] = [
  { id: "EASYPAISA", label: "Easypaisa", Icon: Smartphone },
  { id: "JAZZCASH", label: "JazzCash", Icon: Smartphone },
];

export function PayClient({
  order,
  sandbox,
}: {
  order: { order_no: string; total: number; status: string };
  sandbox: boolean;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<OnlineMethod>("EASYPAISA");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [mobile, setMobile] = useState("");

  const alreadyPaid = order.status !== "PLACED";

  async function pay() {
    setError(undefined);
    setBusy(true);
    const res = await confirmOnlinePayment(order.order_no, method);
    setBusy(false);
    if (res && "error" in res) return setError(res.error);
    router.push(`/shop/order/${order.order_no}`);
  }

  if (alreadyPaid) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-store-olive" strokeWidth={1.25} />
        <h1 className="mt-4 font-serif text-3xl text-store-ink">Already paid</h1>
        <p className="mt-2 text-sm text-store-muted">Order {order.order_no} has been confirmed.</p>
        <Link href={`/shop/order/${order.order_no}`} className="mt-6 inline-block bg-store-ink px-7 py-3.5 text-xs uppercase tracking-[0.18em] text-store-paper">View order</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-5 py-12 lg:px-10">
      <h1 className="text-center font-serif text-4xl text-store-ink">Payment</h1>
      <p className="mt-2 text-center text-sm text-store-muted">Order {order.order_no}</p>

      {sandbox && (
        <div className="mt-6 flex items-center gap-2 border border-store-line bg-store-sand px-4 py-2.5 text-xs text-store-charcoal">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Sandbox mode — no real charge. Connect a gateway in Settings → Integrations to go live.
        </div>
      )}

      <div className="mt-6 border border-store-line bg-store-paper p-6">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-store-charcoal">Amount due</span>
          <span className="font-serif text-2xl text-store-ink">{formatPKR(order.total)}</span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2">
          {METHODS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setMethod(id)}
              className={`flex flex-col items-center gap-1.5 border px-2 py-3 text-xs transition-colors ${method === id ? "border-store-ink bg-store-ink text-store-paper" : "border-store-line text-store-charcoal hover:border-store-ink"}`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-3">
          <Input label={`${method === "JAZZCASH" ? "JazzCash" : "Easypaisa"} mobile number`} value={mobile} onChange={setMobile} placeholder="03xx xxxxxxx" />
        </div>

        {error && <p className="mt-4 text-sm text-coral-text">{error}</p>}

        <button onClick={pay} disabled={busy} className="mt-6 flex w-full items-center justify-center gap-2 bg-store-ink py-3.5 text-xs uppercase tracking-[0.18em] text-store-paper transition-opacity hover:opacity-90 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Pay {formatPKR(order.total)}
        </button>
      </div>

      <Link href="/shop/checkout" className="mt-4 block text-center text-sm text-store-charcoal underline">Cancel and return to bag</Link>
    </div>
  );
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] uppercase tracking-[0.15em] text-store-muted">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-store-line bg-store-cream px-3.5 py-2.5 text-sm text-store-ink focus:border-store-ink focus:outline-none" />
    </div>
  );
}
