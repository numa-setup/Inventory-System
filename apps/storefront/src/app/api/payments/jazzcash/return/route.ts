import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getJazzCashConfig } from "@/lib/payments/gateway";
import { verifyJazzCashResponse } from "@/lib/payments/jazzcash";
import { creditOrder } from "@/lib/payments/credit";
import { logError } from "@hamza/shared/log";

// JazzCash posts the payment result here. We re-verify the secure hash, and on a
// successful, verified response credit the order, then send the customer to the
// confirmation page.
export const dynamic = "force-dynamic";

async function handle(req: NextRequest, fields: Record<string, string>) {
  const origin = req.nextUrl.origin;
  const orderNo = fields.ppmpf_1 || fields.pp_BillReference || "";
  try {
    const cfg = await getJazzCashConfig();
    const verified = cfg.salt ? verifyJazzCashResponse(fields, cfg.salt) : false;
    const success = verified && fields.pp_ResponseCode === "000";
    if (success && orderNo) {
      await creditOrder(orderNo, "JAZZCASH");
      revalidatePath("/admin/orders");
      revalidatePath("/admin/dashboard");
      return NextResponse.redirect(new URL(`/shop/order/${encodeURIComponent(orderNo)}`, origin), 303);
    }
    return NextResponse.redirect(new URL(`/shop/checkout?error=payment`, origin), 303);
  } catch (e) {
    logError(e, { where: "jazzcash.return", orderNo });
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
