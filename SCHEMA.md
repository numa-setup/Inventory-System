# Schema

Source of truth: `supabase/migrations/`. Postgres 15+ (Supabase). RLS enabled on
all tables.

- `0001_init.sql` — enums, tables, ledger trigger, availability view
- `0002_rls.sql` — Row Level Security policies
- `0003_seed.sql` — locations, categories, sample products, opening stock

## Enums

`user_role`, `location_type`, `barcode_type`, `move_reference`, `move_source`,
`costing_method`, `payment_method`, `ledger_entry_type`, `po_status`,
`order_status`, `reservation_status`, `shipment_status`, `discount_type`,
`discount_scope`, `notification_channel`, `recipient_type`.

## Tables

### Identity
- **profiles** — `id`→auth.users, `full_name`, `role`, `active`. Auto-created by
  `handle_new_user()` trigger on signup.

### Catalogue
- **locations** — physical + virtual (`PHYSICAL/SUPPLIER/CUSTOMER/LOSS/ADJUSTMENT/TRANSIT`), `code` unique.
- **categories** — self-referential tree (`parent_id`, `sort`).
- **products** — `sku` unique, prices, `reorder_point`, `safety_stock`,
  `track_lots`, `is_variable_weight`. Trigram index on name for search.
- **product_barcodes** — many per product, `barcode` unique, `is_primary`.
- **product_units** — carton→piece conversions (`factor`).
- **lots** — `lot_number`, `expiry_date` (FEFO).

### Inventory ledger (the heart)
- **stock_moves** — APPEND-ONLY. `qty>0`, `from_location_id`, `to_location_id`,
  `unit_cost`, `reference_type`, `reference_id`, `source`, `idempotency_key`
  unique. UPDATE/DELETE blocked by trigger.
- **stock_levels** — cache: `(product, location, lot)` → `on_hand`, `reserved`,
  `avg_cost`. Maintained by `apply_stock_move()` AFTER INSERT trigger; unique
  index `nulls not distinct`.
- **product_availability** (view) — per-product `on_hand`, `reserved`,
  `available` (=on_hand−reserved), blended `avg_cost`, physical locations only.

### Purchasing
- **suppliers**
- **purchase_orders** / **purchase_order_items** (`received_qty` tracks partials)
- **goods_receipts** / **goods_receipt_items** — receiving writes stock-in moves + cost.

### Customers & sales
- **customers** — `credit_limit`, `credit_balance` (udhaar; positive = owes us).
- **customer_ledger** — `CHARGE`/`PAYMENT`, `balance_after` (running khata).
- **sales** / **sale_items** — POS. Each line records `unit_price` AND
  `unit_cogs`; sale stores `cogs_total` + `profit`.
- **payments** — `CASH/UDHAAR/CARD/COD/BANK` per sale/order.

### Storefront merchandising (admin-controlled)
- **store_listings** — one per product (auto-created), `is_published`,
  `online_price`, `slug` unique, SEO fields, `images[]`, schedule.
- **collections** / **collection_products**, **homepage_sections**, **banners**.

### Discounts
- **discounts** — `PERCENT/FIXED/BOGO/FREE_DELIVERY`, scope, `code`, schedule.
- **discount_redemptions** — usage tracking (links sale/order).

### Online orders & fulfilment
- **orders** / **order_items** — `order_no`, status lifecycle, `payment_type`
  (COD default), totals.
- **reservations** — `HELD/COMMITTED/RELEASED` with `expires_at` (checkout gate).
- **shipments** — courier, tracking, `cod_amount`/`settled_amount` (COD recon).

### System
- **notifications** — recipient (ADMIN/CUSTOMER), `event`, `channel`, `payload`,
  `read_at`. Realtime in-app feed.
- **audit_log** — actor/action/entity/before/after.
- **settings** — singleton (id=1): `costing_method`, currency=PKR, tax,
  store/courier/notification config.

## Stock flow examples

| Operation | Move |
|-----------|------|
| Receive purchase | SUPPLIER → MAIN (with `unit_cost`) |
| POS sale | MAIN → CUSTOMER |
| Damage/loss | MAIN → LOSS |
| Cycle-count gain | ADJUSTMENT → MAIN |
| Transfer | MAIN → other PHYSICAL (via TRANSIT) |
| Customer return | CUSTOMER → MAIN (or → LOSS) |

## RLS summary

- Staff (active profile) read operational tables.
- owner/manager write catalogue & operational management tables.
- Any staff may insert POS tables (sales, sale_items, payments, customers,
  customer_ledger, stock_moves).
- `settings` owner-write; `audit_log` owner/manager read.
- `notifications` scoped to recipient.
- Privileged server actions use service_role (bypass RLS).
- Storefront anon (public) read policies: added with Prompt 2.
