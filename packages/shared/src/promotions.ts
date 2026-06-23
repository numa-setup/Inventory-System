import type { createAdminClient } from "./supabase/admin";
import type { AppliedPromo, Promotion } from "./discounts";

type Db = ReturnType<typeof createAdminClient>;

// Plain helpers (no "use server") so both server components and server actions
// can read promotions with whichever Supabase client they hold.

export const PROMO_SELECT =
  "id, name, type, value, scope, code, min_amount, target_id, buy_qty, get_qty, get_discount_percent, start_at, end_at, active";

export function mapPromotion(d: Record<string, unknown>): Promotion {
  return {
    id: d.id as string,
    name: d.name as string,
    type: d.type as Promotion["type"],
    value: Number(d.value),
    scope: d.scope as Promotion["scope"],
    code: (d.code as string) ?? null,
    min_amount: Number(d.min_amount),
    target_id: (d.target_id as string) ?? null,
    buy_qty: Number(d.buy_qty) || 1,
    get_qty: Number(d.get_qty) || 1,
    get_discount_percent: Number(d.get_discount_percent) || 100,
    start_at: (d.start_at as string) ?? null,
    end_at: (d.end_at as string) ?? null,
    active: Boolean(d.active),
  };
}

/** All active promotions (schedule is enforced in JS via isLive at apply time). */
export async function loadActivePromotions(db: Db): Promise<Promotion[]> {
  const { data } = await db.from("discounts").select(PROMO_SELECT).eq("active", true);
  return (data ?? []).map(mapPromotion);
}

/** Record applied promotions on the redemption ledger (best-effort). */
export async function recordRedemptions(
  db: Db,
  applied: AppliedPromo[],
  meta: { channel: "POS" | "WEB"; sale_id?: string | null; order_id?: string | null; profit?: number | null },
) {
  const rows = applied
    .filter((a) => a.amount > 0 || a.type === "FREE_DELIVERY")
    .map((a) => ({
      discount_id: a.discount_id,
      channel: meta.channel,
      sale_id: meta.sale_id ?? null,
      order_id: meta.order_id ?? null,
      amount: a.amount,
      profit: meta.profit ?? null,
    }));
  if (rows.length) await db.from("discount_redemptions").insert(rows);
}
