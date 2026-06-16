# Schema

Source of truth: `supabase/migrations/`. Postgres 15+ (Supabase). RLS enabled on
all tables.

- `0001_init.sql` — enums, tables, ledger trigger, availability view
- `0002_rls.sql` — Row Level Security policies
- `0003_seed.sql` — locations, categories, sample products, opening stock
- `0004_variants.sql` — **variant model**; stock moves from product → variant level
- `0005_seed_general_store.sql` — general-store categories + variant sample products
- `0006_second_location.sql` — adds the Warehouse physical location
- `0007_purchasing.sql` — rich supplier fields + `supplier_ledger` (payables)

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
- **categories** — self-referential tree (`parent_id`, `sort`). Seeded with
  general-store tree: Cosmetics, Jewellery, Gift Packs, Toys, Accessories,
  Stationery, Personal Care (+ sub-categories).
- **products** — PARENT grouping: `name`, `brand`, `category_id`, `description`,
  `has_variants`, `image_url`, `active`. Keeps `sku`/`default_sale_price` for
  back-compat (mirrors the default variant). Trigram index on name.

#### Variant model (`0004`)
- **product_options** — `(product_id, name)` e.g. "Shade", "Size", `sort`.
- **product_option_values** — `(option_id, value)` e.g. "Ruby Red", "3.5g".
- **product_variants** — `sku` unique, `cost`, `sale_price`, `reorder_point`,
  `is_default` (exactly one per product, partial-unique index), `active`.
  **Stock lives here, not on products.**
- **variant_option_values** — `(variant_id, option_value_id)`: which option
  values define a variant (the cells of the Size × Shade matrix).
- **product_barcodes** — `barcode` unique, now carries `variant_id` (+ product_id).
- **lots** — `lot_number`, `expiry_date` (FEFO), now `variant_id`.

Every product has ≥1 variant; non-variant products auto-get one `is_default`
variant so all downstream logic (stock, POS, receiving, reports) is uniform.

```
products ──┬─< product_options ──< product_option_values
           │                                  │
           └─< product_variants ──< variant_option_values
                     │  (sku, cost, sale_price, reorder, is_default)
                     ├─< product_barcodes
                     ├─< stock_moves / stock_levels  (variant_id)
                     ├─< sale_items / order_items / reservations
                     └─< purchase_order_items / goods_receipt_items
```

### Inventory ledger (the heart) — now variant-keyed
- **stock_moves** — APPEND-ONLY. `qty>0`, `variant_id` (+product_id), locations,
  `unit_cost`, `reference_type`, `source`, `idempotency_key` unique.
  UPDATE/DELETE blocked. `fill_move_variant()` BEFORE-INSERT trigger fills
  `variant_id` from the product's default variant when callers only pass
  `product_id` (back-compat) and vice-versa.
- **stock_levels** — cache: `(variant, location, lot)` → `on_hand`, `reserved`,
  `avg_cost`. Maintained by `apply_stock_move()` AFTER INSERT; unique index
  `nulls not distinct`.
- **variant_availability** (view) — per-variant `on_hand/reserved/available`,
  blended `avg_cost`, physical locations only.
- **product_availability** (view) — same, rolled up per product (back-compat).

### Purchasing
- **suppliers** — rich record: `name` (company), `contact_person`, `phone`,
  `email`, `address`, `city`, `ntn`, `payment_terms`, `bank_details`,
  `opening_balance`, `balance` (payable; +ve = we owe), `notes`.
- **supplier_ledger** — `CHARGE` (goods received) / `PAYMENT` (we paid),
  `balance_after` (running payable). Mirrors `customer_ledger`.
- **purchase_orders** / **purchase_order_items** — multi-line; `variant_id`;
  `received_qty` tracks partials; status DRAFT→SENT→PARTIAL→RECEIVED.
- **goods_receipts** (`total`, `note`) / **goods_receipt_items** (`variant_id`,
  `lot_id`) — multi-product receiving writes one stock-in move per line,
  recomputes weighted-average cost, and charges the supplier ledger.

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
