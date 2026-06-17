import { notFound } from "next/navigation";
import { getOrderByNo } from "@/lib/storefront";
import { getGatewayConfig, getJazzCashConfig } from "@/lib/payments/gateway";
import { buildJazzCashCheckout } from "@/lib/payments/jazzcash";
import { PayClient } from "@/components/store/PayClient";
import { AutoPostForm } from "@/components/store/AutoPostForm";

export const metadata = { title: "Payment" };

export default async function PayPage({ params }: { params: Promise<{ order_no: string }> }) {
  const { order_no } = await params;
  const order = await getOrderByNo(decodeURIComponent(order_no));
  if (!order) notFound();
  const cfg = await getGatewayConfig();

  // Live JazzCash + unpaid order → redirect to their hosted checkout.
  if (cfg.mode === "live" && cfg.provider === "jazzcash" && order.status === "PLACED") {
    const jc = await getJazzCashConfig();
    const { action, fields } = buildJazzCashCheckout({ order_no: order.order_no, total: order.total }, jc);
    return <AutoPostForm action={action} fields={fields} note="Taking you to JazzCash to complete your payment." />;
  }

  return (
    <PayClient
      order={{ order_no: order.order_no, total: order.total, status: order.status }}
      sandbox={cfg.mode === "sandbox"}
    />
  );
}
