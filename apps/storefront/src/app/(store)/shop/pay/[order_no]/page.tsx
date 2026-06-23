import { notFound } from "next/navigation";
import { getOrderByNo } from "@/lib/storefront";
import { getGatewayConfig, getJazzCashConfig, getEasypaisaConfig } from "@/lib/payments/gateway";
import { buildJazzCashCheckout } from "@/lib/payments/jazzcash";
import { buildEasypaisaCheckout } from "@/lib/payments/easypaisa";
import { PayClient } from "@/components/store/PayClient";
import { GatewayChoice } from "@/components/store/GatewayChoice";

export const metadata = { title: "Payment" };

export default async function PayPage({ params }: { params: Promise<{ order_no: string }> }) {
  const { order_no } = await params;
  const order = await getOrderByNo(decodeURIComponent(order_no));
  if (!order) notFound();
  const cfg = await getGatewayConfig();
  const target = { order_no: order.order_no, total: order.total };

  // Live + unpaid order → let the customer pick a configured provider.
  if (cfg.mode === "live" && order.status === "PLACED") {
    const options: { provider: "jazzcash" | "easypaisa"; action: string; fields: Record<string, string> }[] = [];
    if (cfg.providers.includes("jazzcash")) {
      options.push({ provider: "jazzcash", ...buildJazzCashCheckout(target, await getJazzCashConfig()) });
    }
    if (cfg.providers.includes("easypaisa")) {
      options.push({ provider: "easypaisa", ...buildEasypaisaCheckout(target, await getEasypaisaConfig()) });
    }
    return <GatewayChoice order={target} options={options} />;
  }

  return (
    <PayClient
      order={{ order_no: order.order_no, total: order.total, status: order.status }}
      sandbox={cfg.mode === "sandbox"}
    />
  );
}
