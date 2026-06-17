import { notFound } from "next/navigation";
import { getOrderByNo } from "@/lib/storefront";
import { getGatewayConfig } from "@/lib/payments/gateway";
import { PayClient } from "@/components/store/PayClient";

export const metadata = { title: "Payment" };

export default async function PayPage({ params }: { params: Promise<{ order_no: string }> }) {
  const { order_no } = await params;
  const order = await getOrderByNo(decodeURIComponent(order_no));
  if (!order) notFound();
  const cfg = await getGatewayConfig();

  return (
    <PayClient
      order={{ order_no: order.order_no, total: order.total, status: order.status }}
      sandbox={cfg.mode === "sandbox"}
    />
  );
}
