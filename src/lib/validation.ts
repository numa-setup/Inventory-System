import { z } from "zod";

/** Human-readable first validation error (with field path when present). */
export function firstIssue(err: z.ZodError): string {
  const i = err.issues[0];
  if (!i) return "Invalid input.";
  const path = i.path.join(".");
  return path ? `${path}: ${i.message}` : i.message;
}

export const uuid = z.string().uuid("must be a valid id");
const optId = z.string().uuid().nullable().optional();
const money = z.number().finite().nonnegative();
const qty = z.number().finite().positive();
export const payMethod = z.enum(["CASH", "CARD", "BANK", "JAZZCASH", "EASYPAISA", "WALLET", "UDHAAR", "COD"]);

// ---- POS ----------------------------------------------------------------
export const checkoutSchema = z.object({
  lines: z.array(z.object({
    variant_id: uuid,
    product_id: uuid,
    qty,
    unit_price: money,
    discount: money.optional(),
  })).min(1, "Cart is empty."),
  customer_id: optId,
  payments: z.array(z.object({ method: payMethod, amount: z.number().finite() })).min(1, "Add a payment."),
  discount: money.optional(),
  idempotency_key: z.string().min(1),
});

export const returnSchema = z.object({
  sale_id: uuid,
  receipt_no: z.string().min(1),
  items: z.array(z.object({
    sale_item_id: uuid,
    product_id: uuid,
    variant_id: uuid.nullable(),
    qty,
    unit_price: money,
    unit_cogs: money,
  })).min(1, "Select at least one item to return."),
  reason: z.string().nullable().optional(),
  refund_method: payMethod,
  customer_id: optId,
  idempotency_key: z.string().min(1),
});

export const customerQuickSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  phone: z.string().nullable().optional(),
});

// ---- Stock --------------------------------------------------------------
export const stockInSchema = z.object({
  variant_id: uuid, product_id: uuid, qty, unit_cost: money,
  location_code: z.string().optional(),
  lot_number: z.string().nullable().optional(),
  expiry: z.string().nullable().optional(),
  source: z.enum(["MANUAL", "SCAN"]).optional(),
  note: z.string().optional(),
});

export const adjustSchema = z.object({
  variant_id: uuid, product_id: uuid,
  direction: z.enum(["add", "remove"]),
  qty,
  reason: z.string().min(1, "A reason is required."),
  unit_cost: money.nullable().optional(),
  location_code: z.string().optional(),
});

export const transferSchema = z.object({
  variant_id: uuid, product_id: uuid, qty,
  from_code: z.string().min(1), to_code: z.string().min(1),
  unit_cost: money.nullable().optional(),
});

export const cycleCountSchema = z.object({
  variant_id: uuid, product_id: uuid,
  counted_qty: money,
  current_qty: z.number().finite(),
  unit_cost: money.nullable().optional(),
  location_code: z.string().optional(),
});

// ---- Products -----------------------------------------------------------
export const productInputSchema = z.object({
  name: z.string().trim().min(1, "Product name is required."),
  brand: z.string().nullable().optional(),
  category_id: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  base_unit: z.string().optional(),
  base_price: money,
  has_variants: z.boolean(),
  options: z.array(z.object({ name: z.string(), values: z.array(z.string()) })),
  variants: z.array(z.object({
    sku: z.string().trim().min(1, "SKU is required."),
    barcode: z.string().nullable().optional(),
    sale_price: money,
    cost: money,
    reorder_point: money,
    opening_qty: money.nullable().optional(),
    option_values: z.array(z.string()),
  })).min(1, "At least one variant is required."),
});

export const variantPatchSchema = z.object({
  sale_price: money.optional(),
  cost: money.optional(),
  reorder_point: money.optional(),
  active: z.boolean().optional(),
});

export const importRowsSchema = z.array(z.object({
  name: z.string(),
  sku: z.string(),
  barcode: z.string().optional(),
  price: z.number(),
  cost: z.number(),
  qty: z.number(),
})).max(5000, "Import at most 5000 rows at a time.");
