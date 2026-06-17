import { NextResponse, type NextRequest } from "next/server";

// Live payment webhook endpoint. When a real gateway is connected, it POSTs here
// on a completed payment; verify the signature, then credit the order
// (insert a payments row for order_id + set status CONFIRMED). In sandbox mode
// the order is confirmed by confirmOnlinePayment instead, so this just ack's.
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  // TODO: verify provider signature and credit the order in live mode.
  return NextResponse.json({ received: true });
}
