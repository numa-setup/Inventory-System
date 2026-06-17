# PERFORMANCE.md

Performance work for Hamza General Store. **Diagnose before changing** — every
change below is tied to a measured bottleneck, not a guess.

## How to re-run the diagnostics

- **DB:** `node scripts/diagnose.mjs` — row counts, hot-path indexes, and
  `EXPLAIN ANALYZE` on the scan / idempotency / availability queries.
- **Bundle:** `npm run build` — the route table prints **First Load JS** per page.
- **Runtime:** `npm run build && npm run start` then Lighthouse / DevTools on
  `http://localhost:3000`. **Do not benchmark `npm run dev`** (see below).

---

## Round 3 — Section 1 diagnosis (2026-06-17)

### Finding 0 — the #1 real-world slowdown: running `next dev` as production
A `next dev` server compiles each route **on first visit**, ships unminified
React in development mode (double renders, no production optimizations). For a
shopkeeper this feels like multi-second stalls on every new screen. **Always run
the store as `npm run build && npm run start`.** This alone is the largest
single speedup and costs nothing.

### Finding 1 — the database is NOT the bottleneck
`EXPLAIN ANALYZE` at current volume (14 products / 30 variants / 32 moves):

| Query (hot path)                  | Plan                              | Time |
|-----------------------------------|-----------------------------------|------|
| `product_barcodes.barcode =` scan | Index Scan (`..._barcode_key`)    | 1.3 ms |
| `stock_moves.idempotency_key =`   | Index Scan (`..._idempotency_key`)| 1.3 ms |
| `variant_availability` (full)     | GroupAggregate over `stock_levels`| 0.8 ms |

The single-column scan/dedup indexes the brief asked for **already exist** as a
side effect of `UNIQUE` constraints: `product_barcodes.barcode`,
`stock_moves.idempotency_key`, `products.sku`, `product_variants.sku`. Stock is
read from the cached **`stock_levels`** table (maintained by the `apply_stock_move`
trigger) and `variant_availability` aggregates that small cache — the ledger is
**never** replayed to compute a quantity. Good.

### Finding 2 — perceived slowness is client-side
- **No client navigation cache.** Pages are Server Components that pass data as
  props; Next 15 defaults the dynamic router cache to `0`, so every back/forward
  or link re-runs the whole server fetch (5–8 Supabase round-trips to
  `ap-south-1`). → fixed with `staleTimes` (Fix C).
- **recharts (~170 kB) shipped eagerly** in Dashboard (292 kB) and Reports
  (229 kB) First Load JS. → fixed by lazy-loading (Fix B).

### Finding 3 — structural debt for scale (not yet biting at 14 products)
- **Full-table loads.** Every list page (`/products`, `/pos`, `/stock`,
  `/customers`, …) loads entire tables to the client and filters in JS. Fine at
  30 rows, fatal at 5,000. → server-side keyset pagination + debounced server
  search + virtualization (**in progress**, see Backlog).
- **Missing FK / composite indexes** on the variant-keyed columns added in
  Round 2. → fixed in migration `0009` (Fix A).

---

## Fixes applied

### Fix A — migration `0009_perf_indexes.sql`
FK and filter+sort composites that were genuinely missing (each maps to a real
query). Tables are tiny so they build instantly; the payoff is at scale.

| Index | Backs |
|-------|-------|
| `idx_moves_variant`, `idx_moves_variant_created` | variant movement-history timeline |
| `idx_sale_items_sale`, `idx_sale_items_variant`  | receipt lines, per-variant sales reports |
| `idx_barcodes_variant`                            | reverse barcode lookup / label print / catalogue build |
| `idx_vov_variant`                                 | catalogue option-label join |
| `idx_order_items_variant`, `idx_reservations_variant` | availability / orders joins |
| `idx_sales_created_id`                            | sales list keyset pagination `(created_at desc, id desc)` |

### Fix B — code-split charts (recharts lazy)
`src/components/charts/index.tsx` re-exports `AreaTrend`/`BarTrend`/`DonutChart`
via `next/dynamic({ ssr:false })` with a skeleton fallback. Dashboard and Reports
import from the barrel. recharts now downloads only when a chart renders.

| Route | First Load JS before | after | Δ |
|-------|------|------|------|
| `/dashboard` | 292 kB | **186 kB** | −106 kB (−36%) |
| `/reports`   | 229 kB | **122 kB** | −107 kB (−47%) |

### Fix C — client caching & bundle config (`next.config.mjs`)
- `experimental.staleTimes = { dynamic: 30, static: 180 }` — revisiting a screen
  within 30 s is instant (served from the client router cache, no refetch).
- `experimental.optimizePackageImports = ["lucide-react","date-fns","recharts"]`
  — tree-shake barrels to per-symbol imports.
- `images.formats = ["image/avif","image/webp"]` — modern formats via `next/image`.
- TanStack Query already runs `staleTime: 30s`, `refetchOnWindowFocus: false`.

---

## Targets (brief) & status
- Scan-to-cart < 100 ms — **on track**: resolves against an in-memory barcode
  index, DB lookup is 1.3 ms. (Local IndexedDB cache lands in Section 2.)
- Product search < 200 ms — **pending** server-side debounced search.
- Page interactive < 1.5 s on 4G — **improved** via Fixes B/C + running prod
  build; to be confirmed with Lighthouse after pagination lands.
- No full-table loads — **in progress** (Backlog).

## Backlog (remaining Section 1)
1. Server-side keyset pagination + filtering + sorting on every list
   (`/products`, `/stock`, `/customers`, `/orders`, sales, reports). No screen
   fetches a whole table.
2. Debounced (250 ms) server-side search against the trigram / barcode indexes.
3. Lightweight catalogue index endpoint (`variant_id, name, barcode, price,
   stock`) cached in-memory + IndexedDB — powers instant scan/search and the
   Section 2 scanner. Reconciles in the background; survives brief offline.
4. Virtualize long tables with `@tanstack/react-virtual`.
5. Filtered realtime channels (subscribe per-screen, throttle) instead of
   table-wide subscriptions.
