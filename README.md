# Hamza General Store — Inventory & POS

A production-grade inventory management system + (upcoming) connected e-commerce
storefront for a retail store in Pakistan. Admin and storefront share **one
Supabase database**, so stock, prices, and orders never drift.

## Stack

- **Next.js 15** (App Router) + **TypeScript** (strict)
- **Tailwind CSS** + custom component library (`src/components/ui`)
- **Supabase** — Postgres, Auth, Storage, Realtime
- **TanStack Query**, **react-hook-form + zod**
- **Recharts** for charts, **lucide-react** for icons

## Core architectural principle

Stock is **never edited directly**. Every change is an append-only row in
`stock_moves` (a double-entry ledger: every move goes *from* one location *to*
another, including virtual locations — Supplier, Customer, Loss, Adjustment,
Transit). Current stock lives in the `stock_levels` cache, maintained by a
trigger and fully rebuildable from the ledger. Costing is **weighted moving
average**, recomputed on every stock-in. See `SCHEMA.md`.

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

Environment variables live in `.env.local` (gitignored). Required:

| Key | Purpose |
|-----|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin key |
| `SUPABASE_PROJECT_REF` / `SUPABASE_DB_PASSWORD` | For migrations |

## Database

```bash
node scripts/migrate.mjs                                   # apply migrations
node scripts/setup-owner.mjs <email> <password> "Name"     # create owner login
```

`scripts/migrate.mjs` auto-detects the Supabase pooler region and applies
everything in `supabase/migrations/` (idempotent — tracked in
`_schema_migrations`).

## Project layout

```
src/
  app/                 routes (App Router)
    (admin)/           authenticated admin shell + pages
    login/             auth
  components/
    ui/                reusable kit (Card, StatTile, DataTable, …)
    charts/            Recharts wrappers
    layout/            Sidebar, Topbar, AppShell
    theme/             dark-mode provider
  lib/
    supabase/          browser / server / admin clients + types
    utils.ts
supabase/migrations/   SQL schema (source of truth)
scripts/               migrate + owner setup
```

See `ARCHITECTURE.md`, `SCHEMA.md`, and `DESIGN_SYSTEM.md` for details — keep
them current as the system grows.

## Status

**Foundation complete** — design system, component library, app shell, auth,
dashboard, full database schema + ledger + RLS + seed. Modules (Products, Stock,
POS, Purchasing, Customers, Orders, Storefront manager, Discounts, Reports,
Settings) are built incrementally on top. The customer storefront is a later
phase on the same database.
