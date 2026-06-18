import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { easypaisaSucceeded } from "@/lib/payments/easypaisa";
import { creditOrder } from "@/lib/payments/credit";
import { logError } from "@/lib/log";

// Easypaisa posts the payment result here. On a successful status we credit the
// order (idempotent), then send the customer to the confirmation page.
export const dynamic = "force-dynamic";

async function handle(req: NextRequest, fields: Record<string, string>) {
  const origin = req.nextUrl.origin;
  const orderNo = fields.orderRefNum || fields.orderRefNumber || fields.orderId || "";
  try {
    if (easypaisaSucceeded(fields) && orderNo) {
      await creditOrder(orderNo, "EASYPAISA");
      revalidatePath("/orders");
      revalidatePath("/dashboard");
      return NextResponse.redirect(new URL(`/shop/order/${encodeURIComponent(orderNo)}`, origin), 303);
    }
    return NextResponse.redirect(new URL(`/shop/checkout?error=payment`, origin), 303);
  } catch (e) {
    logError(e, { where: "easypaisa.return", orderNo });
    return NextResponse.redirect(new URL(`/shop/checkout?error=payment`, origin), 303);
  }
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const fields: Record<string, string> = {};
  for (const [k, v] of form.entries()) fields[k] = String(v);
  return handle(req, fields);
}

export async function GET(req: NextRequest) {
  const fields: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => { fields[k] = v; });
  return handle(req, fields);
}
