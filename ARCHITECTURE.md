# Architecture

## One repo, one database

The admin inventory system and the (upcoming) customer storefront live in the
same Next.js app and read/write the **same Supabase Postgres database**. This
shared database is the single source of truth that keeps stock, prices, and
orders in sync between the two surfaces.

## Layers

```
Browser (client components)
  └─ TanStack Query ── Supabase browser client (anon key, user session)
Server (RSC / route handlers / server actions)
  ├─ Supabase server client (anon key + session cookies)  → RLS-scoped reads
  └─ Supabase admin client  (service_role)                → privileged writes
Postgres (Supabase)
  ├─ tables + RLS
  ├─ stock_moves (append-only ledger) ──trigger──▶ stock_levels (cache)
  └─ auth.users ──trigger──▶ profiles
```

- **`src/lib/supabase/client.ts`** — browser, anon key. Client components.
- **`src/lib/supabase/server.ts`** — server, anon key + cookies. RSC reads
  honor RLS as the logged-in user.
- **`src/lib/supabase/admin.ts`** — service_role, server-only. Bypasses RLS for
  trusted operations (stock posting, order lifecycle, notifications). Never
  import into client code.

## Auth & routing

- `middleware.ts` refreshes the Supabase session on every request and guards
  admin routes (redirects to `/login` when signed out).
- `src/app/(admin)/layout.tsx` loads the user + profile role and renders the
  `AppShell` (sidebar filtered by role).
- Roles: `owner` (everything), `manager` (most), `cashier` (POS, products read,
  customers). Enforced in UI (nav) **and** in the database (RLS).

## Inventory engine (non-negotiable)

Stock is derived, never stored directly:

1. Every change inserts one `stock_moves` row (`from_location → to_location`).
   Virtual locations model the counterparty (Supplier, Customer, Loss,
   Adjustment, Transit).
2. A trigger updates `stock_levels` (on_hand, reserved, avg_cost) per
   product+location+lot, recomputing the moving-average cost on stock-in.
3. The ledger is **append-only** — `UPDATE`/`DELETE` are blocked by a trigger.
   Corrections are reversing entries.
4. `idempotency_key` (unique) on moves prevents double-counting from
   double-scans/retries.
5. **Available-to-promise** = on_hand − reserved (`product_availability` view).

Costing method is a `settings` value (Weighted Average default; FIFO
selectable). LIFO not allowed.

Since `0004` the ledger is **variant-keyed** (`stock_moves.variant_id`,
`stock_levels` unique on variant+location+lot). A `fill_move_variant()`
BEFORE-INSERT trigger backfills `variant_id`↔`product_id` so callers can pass
either. `variant_availability` is the per-variant ATP view;
`product_availability` rolls it up per product.

### Stock area (`/stock`, `src/features/stock`)

A variant-level workspace. Every action posts an append-only move:

| Action | Ledger move | reference_type |
|--------|-------------|----------------|
| Stock In (no PO) | Supplier → location (with cost, optional lot/expiry) | `PURCHASE` |
| Adjustment | Adjustment → loc (found) / loc → Loss (damage) | `ADJUSTMENT` |
| Transfer | physical → physical (carries cost) | `TRANSFER` |
| Cycle count | correcting move vs counted qty | `COUNT` |

`getMovementHistory(variant_id)` powers the per-variant timeline (qty,
direction, locations, cost, source, actor, time) so the ledger is visible.

## Routes (current)

| Route | Purpose |
|-------|---------|
| `/login` | Auth |
| `/dashboard` | KPIs, charts, recent orders |
| `/(admin)/*` | Module routes (built incrementally) |

Planned admin routes: `/products`, `/stock`, `/purchasing`, `/pos`,
`/customers`, `/orders`, `/storefront`, `/discounts`, `/reports`, `/settings`.
Storefront (Prompt 2) will add public routes (`/`, `/p/[slug]`, `/cart`,
`/checkout`, `/track`) reading published `store_listings`.

## Notifications (planned)

A central `notify(event, recipients, channels, payload)` dispatcher writes to
`notifications` and fans out: in-app (Realtime, always), email (Resend),
WhatsApp/SMS (adapters, stubbed). Topbar bell subscribes to the user's
notifications for live unread counts.

## Migrations & types

- SQL in `supabase/migrations/` is the source of truth; applied via
  `scripts/migrate.mjs` (pooler, region auto-detected, idempotent).
- `src/lib/supabase/types.ts` is currently a permissive stub; regenerate with
  `supabase gen types` once the CLI is linked for full table typing.
