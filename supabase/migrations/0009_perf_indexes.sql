-- ------------------------------------------------------------
-- Round 3 / Section 1 — Performance indexes
-- ------------------------------------------------------------
-- Diagnosis (scripts/diagnose.mjs) showed the single-column scan/dedup
-- paths (product_barcodes.barcode, stock_moves.idempotency_key,
-- products.sku, product_variants.sku) are ALREADY indexed via UNIQUE
-- constraints. What is genuinely missing are foreign-key and
-- filter+sort composite indexes that matter as the store grows past a
-- few thousand rows. Every index below maps to a real query in the app.
-- Tables are tiny today, so these build instantly.

-- Variant became the stock key in Round 2 T1, but stock_moves was only
-- indexed by product_id. The movement-history timeline filters by
-- variant_id and sorts by created_at (features/stock/actions.ts).
create index if not exists idx_moves_variant         on stock_moves(variant_id);
create index if not exists idx_moves_variant_created on stock_moves(variant_id, created_at desc);

-- Receipt / reporting joins: fetch the lines for a sale, and sum sales
-- per variant. sale_items had only its primary key.
create index if not exists idx_sale_items_sale    on sale_items(sale_id);
create index if not exists idx_sale_items_variant on sale_items(variant_id);

-- Reverse barcode lookup by variant (catalogue index build + label print);
-- product_barcodes was only indexed by product_id.
create index if not exists idx_barcodes_variant on product_barcodes(variant_id);

-- Catalogue label join (variant -> option values) in lib/catalog.ts.
create index if not exists idx_vov_variant on variant_option_values(variant_id);

-- Availability / orders join FKs that were unindexed.
create index if not exists idx_order_items_variant  on order_items(variant_id);
create index if not exists idx_reservations_variant on reservations(variant_id);

-- Sales list pagination: keyset sort is (created_at desc, id desc).
create index if not exists idx_sales_created_id on sales(created_at desc, id desc);
