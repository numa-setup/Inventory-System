# Hamza General Store — Architecture Report

> Read-only inspection. No code, files, or git state were modified to produce this
> report (this report file is the only addition). Generated 2026-06-23.

---

## A. Git status (read-only inspection)

- **Is it a git repository?** Yes — a `.git` folder is present at the project root.
- **Current branch:** `master`
- **Branches:** only `master` (local). No other local branches.
- **Remotes:** **none configured** — `git remote -v` returns nothing. There is **no
  `origin`** and no remote URL set. The project has never been pushed anywhere.
- **Working tree:** **clean** — `git status` reports "nothing to commit, working tree
  clean" (before this report file was written).

### .gitignore

A `.gitignore` exists. Full contents:

```gitignore
# dependencies
/node_modules
/.pnp
.pnp.js

# next.js
/.next/
/out/
next-env.d.ts

# production
/build

# misc
.DS_Store
*.pem
Thumbs.db

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# local env files — NEVER commit secrets
.env
.env.local
.env*.local

# supabase
/supabase/.temp
/supabase/.branches

# typescript
*.tsbuildinfo

# editor
.vscode/*
!.vscode/extensions.json
.idea
```

- `node_modules` → **ignored** ✅ (`/node_modules`)
- `.next` → **ignored** ✅ (`/.next/`)
- `.env*` → **ignored** ✅ (`.env`, `.env.local`, `.env*.local`). `git check-ignore`
  confirms `.env.local`, `node_modules`, and `.next` are all ignored.
  - Minor note: the patterns cover `.env`, `.env.local`, and `*.local` env files. A
    non-local variant such as `.env.production` (no `.local` suffix) would **not** be
    matched — but no such file exists, so this is only a future caution.

### Secrets check (important)

- **Env files on disk:** only **`.env.local`** (1 file, ~1.6 KB).
- **Tracked by git?** **No.** `git ls-files` matching `.env|secret|credential` returns
  nothing — `.env.local` is **untracked**.
- **In commit history?** **No.** `git log --all --name-only` shows no `.env`/secret
  file ever committed.
- **Verdict:** ✅ No secret/env files are tracked or in history. Secrets are correctly
  kept out of git. (No secret values are printed in this report.)

---

## B. Stack & tooling

| Area | Detail |
|---|---|
| Framework | **Next.js 15** (`^15.1.3`), **App Router** (`src/app/**`, server components + server actions; `src/middleware.ts`) |
| Language | **TypeScript** `^5.7.2` (strict; path alias `@/* → ./src/*`) |
| React | **React 19** (`^19.0.0`) |
| Styling | **Tailwind CSS** `^3.4.17` (+ `postcss`, `autoprefixer`, `tailwind-merge`, `clsx`) |
| Data/back-end | **Supabase** (`@supabase/supabase-js ^2.47.10`, `@supabase/ssr ^0.5.2`) |
| Client cache | **TanStack React Query** `^5.62.7` |
| Forms / validation | `react-hook-form`, `@hookform/resolvers`, **zod** |
| Charts | **recharts** (lazy-loaded) |
| PDF | **pdf-lib** (invoices/receipts) |
| Barcode scan | `@zxing/browser`, `@zxing/library` (camera) + custom keyboard-wedge handler |
| Icons | `lucide-react` |
| Dates | `date-fns` |
| Tests | **Vitest** `^4.1.9` |
| DB scripts | `pg` + `dotenv` (migration/diagnostic scripts in `/scripts`) |
| Package manager | **npm** (`package-lock.json` present; no `pnpm-lock`/`yarn.lock`) |

### package.json — scripts

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

### package.json — dependencies

```json
"dependencies": {
  "@hookform/resolvers": "^3.9.1",
  "@supabase/ssr": "^0.5.2",
  "@supabase/supabase-js": "^2.47.10",
  "@tanstack/react-query": "^5.62.7",
  "@zxing/browser": "^0.2.0",
  "@zxing/library": "^0.22.0",
  "clsx": "^2.1.1",
  "date-fns": "^4.1.0",
  "lucide-react": "^0.469.0",
  "next": "^15.1.3",
  "pdf-lib": "^1.17.1",
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "react-hook-form": "^7.54.2",
  "recharts": "^2.15.0",
  "tailwind-merge": "^2.6.0",
  "zod": "^3.24.1"
},
"devDependencies": {
  "@types/node": "^22.10.2",
  "@types/pg": "^8.20.0",
  "@types/react": "^19.0.2",
  "@types/react-dom": "^19.0.2",
  "autoprefixer": "^10.4.20",
  "dotenv": "^17.4.2",
  "pg": "^8.21.0",
  "postcss": "^8.4.49",
  "tailwindcss": "^3.4.17",
  "typescript": "^5.7.2",
  "vitest": "^4.1.9"
}
```

### Hosting / deploy config

**None present.** No `vercel.json`, `netlify.toml`, `wrangler.toml`, `Dockerfile`,
`docker-compose`, or CI/CD workflow files were found at the root or one level deep. The
project is currently run locally via `next dev` / `next build && next start` and has no
deployment configuration committed.

---

## C. Folder structure

```
Hamza General Store/
├── .git/                      # git repo (branch: master, no remote)
├── .env.local                 # local secrets (untracked, ignored)
├── .gitignore
├── next.config.mjs            # images, experimental caching, serverActions body limit
├── tailwind.config.ts
├── tsconfig.json              # @/* → ./src/*
├── vitest.config.ts
├── package.json / package-lock.json
├── ARCHITECTURE.md  DESIGN_SYSTEM.md  PERFORMANCE.md  SCHEMA.md  TESTING.md  README.md
├── attached_design_refrences/ # design reference images
├── scripts/                   # migrate.mjs, db.mjs, diagnose.mjs, reseed.mjs, setup-owner.mjs ...
├── supabase/
│   └── migrations/            # 0001 … 0027 SQL migrations (schema, RLS, RPCs, views)
└── src/
    ├── middleware.ts          # session refresh + /admin guard
    ├── app/
    │   ├── page.tsx           # "/" → redirect to /shop  (root = storefront)
    │   ├── login/             # STAFF login  (admin auth)
    │   ├── reset-password/    # staff password reset
    │   ├── (store)/           # ───────── CUSTOMER STOREFRONT (public) ─────────
    │   │   ├── layout.tsx
    │   │   └── shop/
    │   │       ├── (home/listing)        # /shop
    │   │       ├── product/[slug]/       # product detail
    │   │       ├── checkout/             # cart → order
    │   │       ├── pay/[order_no]/       # online payment
    │   │       ├── order/[order_no]/     # order confirmation
    │   │       ├── wishlist/             # guest wishlist
    │   │       └── about/
    │   ├── admin/             # ───────── ADMIN / INVENTORY + POS (protected) ─────────
    │   │   ├── layout.tsx  page.tsx  loading.tsx  error.tsx
    │   │   ├── dashboard/     # KPIs, charts, realtime
    │   │   ├── pos/           # Point of Sale (billing, scan, receipts)
    │   │   ├── products/      # catalogue + variants
    │   │   ├── stock/         # stock levels / movements
    │   │   ├── purchasing/    # suppliers, POs, goods receipt, record purchase
    │   │   ├── orders/        # web-order fulfilment board
    │   │   ├── customers/     # customers + udhaar (khata) ledger
    │   │   ├── categories/    # category tree
    │   │   ├── discounts/     # promotions engine admin
    │   │   ├── reports/       # sales/profit/inventory/etc. reports
    │   │   ├── storefront/    # storefront catalogue management (publish/price)
    │   │   └── settings/      # store/users/security/integrations/...
    │   └── api/               # ───────── route handlers ─────────
    │       ├── catalog/                 # in-memory catalogue index feed (admin/scan)
    │       ├── cron/release-reservations/   # CRON_SECRET-gated reservation expiry
    │       └── payments/
    │           ├── jazzcash/return/
    │           ├── easypaisa/return/
    │           └── webhook/
    ├── features/             # feature modules (actions.ts + Client.tsx per domain)
    │   ├── pos/ products/ stock/ purchasing/ orders/ customers/ categories/
    │   ├── discounts/ reports/ settings/ dashboard/ search/ notifications/
    │   └── storefront/       # storefront server actions (order-actions, actions)
    ├── components/
    │   ├── ui/               # shared design-system primitives (Card, Button, Input, …)
    │   ├── layout/           # AppShell, Sidebar, Topbar, NotificationsBell (ADMIN chrome)
    │   ├── store/            # STOREFRONT chrome (StoreHeader, ProductCard, CartProvider…)
    │   ├── scan/             # ScanProvider, CameraScanner, ScanActionSheet
    │   ├── charts/           # lazy recharts barrel
    │   └── theme/            # ThemeProvider
    └── lib/
        ├── supabase/         # client.ts, server.ts, admin.ts, types.ts
        ├── payments/         # jazzcash, easypaisa, gateway, credit
        ├── notifications/    # whatsapp, dispatch
        ├── storefront.ts     # public storefront data reads (service client)
        ├── catalog.ts / catalog-cache.ts / useCatalog.ts   # catalogue index
        ├── barcode.ts / useHardwareScanner.ts / sound.ts   # scanning
        ├── receipt.ts / receipt-pdf.ts / number-to-words.ts # ONE invoice template
        ├── pricing.ts / discounts.ts / validation.ts / pos-queue.ts
        └── dates.ts  csv.ts  products-query.ts  auth.ts  log.ts  utils.ts
```

**Route ownership at a glance:**
- **Customer storefront (public):** `/` (redirects to `/shop`), everything under
  `src/app/(store)/shop/**`. Route group `(store)` → public URLs under `/shop/*`.
- **Admin / inventory + POS (protected):** everything under `src/app/admin/**`, plus
  `/login` and `/reset-password` for staff.
- **Shared API:** `src/app/api/**` (catalogue feed, cron, payment returns/webhook).

---

## D. Storefront vs inventory separation (most important)

### One app or two?

**It is ONE Next.js application** (a single repo, single `package.json`, single
`next.config.mjs`, single build/deploy). Storefront and admin are separated only by
**route segments within the same app**:
- Customer storefront = the `(store)` route group → `/shop/*` (and `/` redirects there).
- Admin/inventory = the `/admin/*` segment, gated by `src/middleware.ts`.

They are logically separated but **deployed as one unit**.

### What they share

Both halves draw on the same shared layer:

| Shared module | Used by |
|---|---|
| `@/lib/supabase/*` (`admin.ts` service client) | Storefront reads/writes go through `createAdminClient` (server actions); admin uses `server.ts`/`client.ts` |
| `@/lib/storefront.ts` | Storefront data reads (13 import sites) |
| `@/lib/discounts.ts`, `@/features/discounts/promotions.ts` | Promotions engine — **shared by POS and storefront** (same pricing applied both channels) |
| `@/lib/pricing.ts` | Totals/rounding — shared by POS checkout + storefront checkout |
| `@/lib/validation.ts` | zod schemas — shared (`placeOrderSchema`, checkout, etc.) |
| `@/lib/payments/*` (`jazzcash`, `easypaisa`, `gateway`, `credit`) | Online payments — used by storefront pay flow (+ settings/admin config) |
| `@/lib/notifications/*` (`dispatch`, `whatsapp`) | Order notifications (storefront) + receipt WhatsApp (POS) |
| `@/lib/utils.ts` | Everywhere (`cn`, formatting) — 9 storefront import sites |
| `@/components/ui/*` (`Card`, `Button`, `Input`, `DataTable`, `PageHeader`, `StatTile`, `Toast`) | A handful reused by storefront; storefront mostly has its own `@/components/store/*` |
| Supabase database (all tables/views) | **Both** read/write the same single Postgres |

Storefront has its **own** presentation layer in `@/components/store/*` (StoreHeader,
StoreFooter, ProductCard, ProductMedia, ProductGallery, CartProvider/CartDrawer,
WishlistProvider, CheckoutForm, PayClient, GatewayChoice) and its own typography/palette
(serif `store` theme), so the two UIs are visually independent.

### How coupled are they? Could they be split into two deployments?

**Moderately coupled, but a split is feasible without large rewrites.** Observations:

- **Data layer is cleanly shareable.** The storefront reads/writes exclusively through
  **server-side service-role server actions** (`createAdminClient` in
  `features/storefront/*` and `lib/storefront.ts`). It does **not** depend on a logged-in
  customer session. Two deployments can safely share the **one** Supabase database.
- **Cross-links are minimal:**
  - `src/app/page.tsx` redirects `/` → `/shop`.
  - `StoreFooter.tsx` has a single discreet **"Staff login" → `/login`** link.
  - These are the only hard cross-references; both are trivial to repoint to a separate
    admin domain.
- **No shared base path / no admin imports in storefront.** Storefront code imports only
  shared `lib/*`, `components/ui/*`, `components/store/*`, and `features/storefront/*` —
  it does **not** import admin feature modules. (`/admin` and `/login` appear in
  storefront code only as the two link strings above.)
- **Shared code to factor out** if split: `lib/discounts`, `lib/pricing`,
  `lib/validation`, `lib/payments`, `lib/notifications`, `lib/storefront`, `lib/utils`,
  and the reused `components/ui` primitives. These would become a shared package or be
  duplicated.

**Bottom line:** the seam is already along route groups (`(store)` vs `admin`), data
access is service-role server-side, and customer flows are session-less. Splitting into
two deployments pointed at the same Supabase project is realistic; the main work is
extracting the shared `lib/*` + `components/ui` into a shared module and repointing two
link strings — not a rewrite.

---

## E. Database & data access

### Supabase clients (where created)

| File | Key | Context | Purpose |
|---|---|---|---|
| `src/lib/supabase/client.ts` | anon (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) | `"use client"` browser | client components (subject to RLS) |
| `src/lib/supabase/server.ts` | anon + user session via cookies | server components | per-user reads (subject to RLS) |
| `src/lib/supabase/admin.ts` | **service role** (`SUPABASE_SERVICE_ROLE_KEY`) | `import "server-only"` | privileged server actions (**bypasses RLS**) |
| `src/middleware.ts` | anon (`createServerClient`) | edge/middleware | refreshes session, reads `auth.getUser()` |

- Keys are read from env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (public), `SUPABASE_SERVICE_ROLE_KEY` (server-only, guarded by `server-only`).
- **Most admin writes and all storefront reads/writes go through the service-role
  client in server actions** (`"use server"`), i.e. privileged server-side, never
  exposing the key to the browser.

### RLS (Row-Level Security)

**RLS is enabled and used.** Migration `0002_rls.sql` enables RLS on all operational
tables and defines staff/owner policies (≈12 policies); further policies in
`0004_variants.sql`, `0007_purchasing.sql`, and an owner-only delete policy in
`0020_owner_delete_products.sql`. Examples:
- `staff read` (SELECT to `authenticated` where `is_staff()`),
- `managers write` (ALL where `is_owner_or_manager()`),
- `read own or staff` on `profiles`, `owner write settings`, notification ownership,
  etc.
- Helper predicates: `is_staff()`, `is_owner()`, `is_owner_or_manager()`.
- Public storefront read access is granted via later policies/views; storefront server
  actions use the service-role client and therefore are not blocked by RLS.

### Region

The Supabase project is in **`ap-south-1` (Mumbai)** — confirmed by the pooler host used
by the DB scripts (`aws-1-ap-south-1.pooler.supabase.com`; the diagnostic connects there
first). Project ref is `qdftxmdxernjzwipqyrq` (from `NEXT_PUBLIC_SUPABASE_URL` /
`SUPABASE_PROJECT_REF`). Mumbai is the nearest Supabase region to Pakistan.

### Main tables (≈40) and views

**Tables:** `profiles`, `settings`, `audit_log`, `categories`, `products`,
`product_variants`, `product_options`, `product_option_values`,
`variant_option_values`, `product_barcodes`, `product_units`, `locations`, `lots`,
`stock_moves`, `stock_levels`, `suppliers`, `supplier_ledger`, `purchase_orders`,
`purchase_order_items`, `goods_receipts`, `goods_receipt_items`, `sales`, `sale_items`,
`sale_returns`, `sale_return_items`, `customers`, `customer_ledger`, `payments`,
`orders`, `order_items`, `reservations`, `shipments`, `discounts`,
`discount_redemptions`, `store_listings`, `collections`, `collection_products`,
`banners`, `homepage_sections`, `notifications`.

**Views:** `catalog_index`, `variant_availability`, `product_availability`,
`store_catalog`, `discount_usage`.

**How both sides use them (confirming safe shared DB):**
- **Stock model:** append-only `stock_moves` ledger → `stock_levels` cache (via trigger)
  → `variant_availability`/`product_availability` views. Reads come from the cache, not
  by replaying the ledger. Weighted-average costing.
- **Admin (POS/inventory):** writes sales/sale_items/payments, stock_moves, purchase
  orders/goods receipts, customer_ledger (udhaar), etc.
- **Storefront:** reads published catalogue via `store_catalog`/`lib/storefront.ts`;
  `placeOrder` (server action, service client) writes `orders` + `order_items` +
  `reservations` (HELD holds stock so it drops from POS availability too). Fulfilment in
  admin `/orders` ships stock via the same ledger.
- Because both channels go through the same ledger + caches and the storefront writes via
  server-side service-role actions, **one shared database across two deployments is
  safe** — availability and costing stay consistent across POS and web.

### Realtime subscriptions

- **One** realtime subscription found: `src/features/dashboard/DashboardClient.tsx`
  opens a `"dashboard"` channel listening to `postgres_changes` (event `*`, schema
  `public`) on **`sales`, `stock_moves`, and `orders`**, and refreshes the dashboard on
  change. (Migrations add these tables to the `supabase_realtime` publication;
  `stock_levels` was given `REPLICA IDENTITY FULL` for reservation realtime.)
- No other live subscriptions; the rest is request/response + TanStack Query caching.

---

## F. Auth

- **Staff/admin auth:** Supabase Auth (email/password). Login at `/login`; password reset
  at `/reset-password`. Roles come from the `profiles` table (owner / manager / staff),
  enforced by RLS predicates (`is_staff()`, `is_owner()`, `is_owner_or_manager()`).
- **Admin protection (middleware):** `src/middleware.ts` runs on every non-static request,
  refreshes the Supabase session, and:
  - redirects unauthenticated users hitting `/admin` or `/admin/*` → `/login?next=…`;
  - redirects already-authenticated users away from `/login` → `/admin/dashboard`.
  - Matcher excludes `_next/static`, `_next/image`, `favicon.ico`, and common image
    extensions.
- **Customer (storefront) auth:** **none — guest checkout.** No `supabase.auth` calls
  exist anywhere under `(store)`, `components/store`, or `features/storefront`. Customers
  are identified by phone at checkout; orders/wishlist are session-less (wishlist is
  per-device localStorage). The storefront is fully public.
- **Same Supabase project, but only staff use Supabase Auth.** Customers never
  authenticate; their writes happen through server-side service-role server actions.

---

## G. Environment & config (names only — no values)

### Read in code (`process.env.*`)

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Public** | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Public** | Supabase anon key (browser/SSR, RLS-bound) |
| `NEXT_PUBLIC_APP_URL` | **Public** | Public base URL (payment return URLs, links) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** | Service-role key (bypasses RLS; `server-only`) |
| `SUPABASE_PROJECT_REF` | **Server-only** | Project ref (DB scripts) |
| `SUPABASE_DB_PASSWORD` | **Server-only** | Direct DB/pooler password (migration scripts) |
| `CRON_SECRET` | **Server-only** | Guards `/api/cron/release-reservations` |
| `WHATSAPP_TOKEN` | **Server-only** | WhatsApp Cloud API token (receipt/notify) |
| `WHATSAPP_PHONE_NUMBER_ID` | **Server-only** | WhatsApp Cloud API sender id |

### Additional names present in `.env.local` (not all read via `process.env`)

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_NAME` | **Public** | App display name |
| `NEXT_PUBLIC_CURRENCY` | **Public** | Currency label |
| `RESEND_API_KEY` | **Server-only** | Email (Resend). Note: email keys are also stored in the `settings` table (`courier_keys`); this env name exists but app code primarily reads the key from settings. |

> Some integration keys (Stripe/JazzCash/Easypaisa/Resend) are stored in the **`settings`
> table** (`store_info` / `courier_keys`) and configured via Settings → Integrations,
> rather than env vars, so the owner can go live without code changes. Values are not
> shown here.

### `next.config.mjs` highlights

- `images`: AVIF/WebP, remote pattern allow-list for the Supabase storage public bucket.
- `experimental.staleTimes`: `{ dynamic: 120, static: 300 }` (client RSC router cache).
- `experimental.optimizePackageImports`: `["lucide-react", "date-fns", "recharts"]`.
- `experimental.serverActions.bodySizeLimit`: `"10mb"` (photo uploads).
- `reactStrictMode: true`.

---

## H. Performance notes (observations only — no fixes)

These are observations from inspection (and the project's own `PERFORMANCE.md`), not
changes:

1. **Supabase region is already optimal** for Pakistan — `ap-south-1` (Mumbai). Network
   round-trip to the pooler is on the order of ~70 ms each; queries themselves execute
   sub-millisecond. The app is **latency-bound on round-trips, not DB-bound**, so the
   number of sequential server→DB calls per screen matters more than query speed.
2. **`next dev` per-route first-compile is the dominant perceived slowness.** In
   development each route compiles on first visit (multiple seconds), then is fast
   (~tens of ms) once warm. A production build (`next build && next start`) precompiles
   routes and removes this. (This is a run-mode observation, not a code issue.)
3. **Caching is in place:** TanStack Query is configured with `staleTime` 60 s, `gcTime`
   30 min, `refetchOnMount: false`, `refetchOnWindowFocus: false`; Next `staleTimes.dynamic`
   = 120 s caches the RSC payload; the sidebar prefetches routes on hover/focus. So
   repeat tab-switches should be near-instant from cache.
4. **Indexes look complete** on hot paths: unique indexes on `product_barcodes.barcode`,
   `product_variants.sku`, `stock_moves.idempotency_key`; FK indexes; `sales.created_at`
   and a keyset `(created_at DESC, id DESC)`; a trigram GIN index on `products.name`.
5. **Stock is read from the cache, not the ledger** (`stock_levels` /
   `variant_availability` views) — good; no full-ledger summation on reads.
6. **A few server pages still issue multi-step reads.** Most heavy pages batch with
   `Promise.all`, and the dashboard/orders reads were recently flattened, but list pages
   vary — worth confirming each list paginates server-side rather than loading whole
   tables as data grows (current data volume is small: ~57 products, ~16 sales, so this
   is not visible yet).
7. **Heavy libraries are already code-split / lazy** — recharts via a dynamic barrel
   (`components/charts`), camera scanner lazily, pdf-lib only on receipt actions — so the
   base bundle stays modest (largest first-load is the POS screen).
8. **Single realtime channel** (dashboard) listening to `*` on three tables; fine at
   current scale, but a busy store could see frequent dashboard refreshes.

---

*End of report.*
