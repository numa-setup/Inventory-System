# Monorepo Migration Plan — Hamza General Store

> **Planning document only. No application files were moved, renamed, created, or
> edited to produce this.** Work branch: `on-going-development` (main + dev stay safe).
> Generated 2026-06-23.

## Goal

Convert the single Next.js app into a **monorepo with two deployable apps** that share
**one** Supabase database:

| Workspace | What it is | From today |
|---|---|---|
| `apps/storefront` | Customer e-commerce site | `src/app/(store)/shop/*` |
| `apps/admin` | Inventory + POS + admin | `src/app/admin/*` (+ `/login`, `/reset-password`) |
| `packages/shared` | Code both apps import | shared `lib/*`, `components/ui`, `components/theme`, supabase clients, types |

Both apps deploy to **separate domains** but talk to the **same Supabase project**. The
shared database *is* the synchronisation mechanism — no app-to-app API is needed (a web
order places a `HELD` reservation that immediately lowers POS availability, etc.).

---

## 0. Facts this plan is based on (from read-only inspection)

- ~**443** `@/…` import occurrences across **117** files (`@/lib` 212, `@/components`
  202, `@/features` 29).
- Storefront code (`app/(store)`, `components/store`, `features/storefront`) imports from
  the shared layer but **does not import any admin feature module**.
- `lib/payments/*` is used **only** by the storefront + the `api/payments/*` routes — **not
  by admin**.
- `lib/notifications/*` is used by **both** (admin POS receipt WhatsApp + storefront order
  notifications).
- Three couplings to untangle (flagged below):
  1. `lib/auth.ts` imports the **`Role`** type from `components/layout/nav.ts`.
  2. The **root** `app/layout.tsx` + `app/providers.tsx` + `globals.css` currently wrap
     **both** storefront and admin.
  3. `app/page.tsx` redirects `/ → /shop`, and `StoreFooter` links **"Staff login" → /login**
     — same-app cross-links that must become cross-**domain** after the split.
- `features/discounts/promotions.ts` is a plain (non-`"use server"`) helper imported by
  **both** sides → must become shared.

---

## 1. Proposed final folder structure

```
Hamza-General-Store/                      (repo root = npm workspace)
├── package.json                          # { "workspaces": ["apps/*","packages/*"] }
├── package-lock.json                     # single lockfile for the whole repo
├── turbo.json                            # task pipeline (build/lint/test/typecheck)
├── tsconfig.base.json                    # shared compiler options + path aliases
├── .gitignore                            # add apps/*/.next, packages/*/dist
├── .env.example                          # documents var names (no secrets)
│
├── supabase/
│   └── migrations/                       # ONE schema, source of truth for both apps
├── scripts/                              # DB tooling: migrate, db, diagnose, reseed, setup-owner
├── docs/  (ARCHITECTURE.md, SCHEMA.md, DESIGN_SYSTEM.md, PERFORMANCE.md, TESTING.md,
│           ARCHITECTURE-REPORT.md, MONOREPO-MIGRATION-PLAN.md, README.md)
│
├── packages/
│   └── shared/                           # @hamza/shared
│       ├── package.json                  # name "@hamza/shared", exports map
│       ├── tsconfig.json
│       ├── tailwind-preset.ts            # shared theme tokens (brand/accent + store palette, fonts)
│       └── src/
│           ├── supabase/                 # client.ts, server.ts, admin.ts, types.ts
│           ├── auth.ts                   # + the relocated `Role` type
│           ├── discounts.ts  pricing.ts  validation.ts  utils.ts  log.ts  dates.ts
│           ├── promotions.ts             # was features/discounts/promotions.ts
│           ├── notifications/            # dispatch.ts, whatsapp.ts
│           ├── components/ui/            # Card, Button, Input, DataTable, PageHeader, StatTile, Toast, …
│           ├── components/theme/         # ThemeProvider
│           └── index.ts / subpath exports
│
└── apps/
    ├── admin/                            # @hamza/admin  (inventory + POS)
    │   ├── package.json  next.config.mjs  tailwind.config.ts  postcss.config.mjs  tsconfig.json
    │   ├── middleware.ts                 # protects the WHOLE app
    │   └── src/
    │       ├── app/
    │       │   ├── layout.tsx providers.tsx globals.css   # admin shell (split from root)
    │       │   ├── dashboard/ pos/ products/ stock/ purchasing/ orders/
    │       │   │   customers/ categories/ discounts/ reports/ storefront/ settings/
    │       │   ├── login/ reset-password/
    │       │   ├── page.tsx               # → redirect to /dashboard (or render login)
    │       │   └── api/catalog/           # catalogue feed for scan/POS
    │       ├── features/                  # pos products stock purchasing orders customers
    │       │   │                          # categories discounts(client/actions) reports
    │       │   │                          # settings dashboard search notifications
    │       ├── components/                # layout/ (AppShell,Sidebar,Topbar,nav) scan/ charts/
    │       └── lib/                       # barcode catalog catalog-cache useCatalog
    │                                      # useHardwareScanner csv pos-queue products-query
    │                                      # receipt receipt-pdf number-to-words sound
    │
    └── storefront/                        # @hamza/storefront  (customer shop)
        ├── package.json  next.config.mjs  tailwind.config.ts  postcss.config.mjs  tsconfig.json
        ├── middleware.ts                  # OPTIONAL — session refresh only (no auth gate)
        └── src/
            ├── app/
            │   ├── layout.tsx providers.tsx globals.css   # store shell (split from root)
            │   ├── page.tsx               # shop home (no more /→/shop redirect)
            │   ├── product/[slug]/ checkout/ pay/[order_no]/ order/[order_no]/ wishlist/ about/
            │   └── api/
            │       ├── payments/jazzcash/return  payments/easypaisa/return  payments/webhook
            │       └── cron/release-reservations
            ├── features/storefront/       # actions.ts, order-actions.ts
            ├── components/store/          # StoreHeader/Footer, ProductCard, Cart*, Wishlist*, Checkout/Pay…
            └── lib/                       # storefront.ts + payments/(gateway,jazzcash,easypaisa,credit)
```

---

## 2. Exact file/folder mapping

### → `packages/shared` (imported by BOTH — must be shared)

| Today | Move to | Why shared |
|---|---|---|
| `src/lib/supabase/{client,server,admin,types}.ts` | `packages/shared/src/supabase/` | Both apps create clients (admin uses all 3; storefront uses `admin.ts`) |
| `src/lib/auth.ts` | `packages/shared/src/auth.ts` | Imported by both |
| **`Role` type** in `src/components/layout/nav.ts` | `packages/shared/src/auth.ts` (or `types.ts`) | `lib/auth` needs it; breaks the lib→component coupling |
| `src/lib/discounts.ts` | `packages/shared/src/discounts.ts` | Promotions engine — POS + storefront |
| `src/lib/pricing.ts` | `packages/shared/src/pricing.ts` | Totals/rounding — both checkouts |
| `src/lib/validation.ts` | `packages/shared/src/validation.ts` | zod schemas — both |
| `src/lib/utils.ts` | `packages/shared/src/utils.ts` | `cn`/formatting — everywhere |
| `src/lib/log.ts` | `packages/shared/src/log.ts` | Used by shared `notifications/dispatch` + admin |
| `src/lib/dates.ts` | `packages/shared/src/dates.ts` | Generic; safe in shared (storefront may use later) |
| `src/lib/notifications/{dispatch,whatsapp}.ts` | `packages/shared/src/notifications/` | Admin receipt WhatsApp **and** storefront order notifications |
| `src/features/discounts/promotions.ts` | `packages/shared/src/promotions.ts` | Imported by both (storefront `lib/storefront`, admin POS/discounts) |
| `src/components/ui/*` | `packages/shared/src/components/ui/` | Used by admin, storefront, login, charts, scan |
| `src/components/theme/*` | `packages/shared/src/components/theme/` | Both root shells use `ThemeProvider` |
| theme tokens in `tailwind.config.ts` | `packages/shared/tailwind-preset.ts` | Both apps extend it (brand/accent + `store` palette + fonts) |

### → `apps/admin` (admin-only)

- **Routes:** `src/app/admin/*`, `src/app/login`, `src/app/reset-password`,
  `src/app/api/catalog`. Plus the **admin** split of `app/layout.tsx`,
  `app/providers.tsx`, `globals.css`, `global-error.tsx`, `not-found.tsx`.
- **Middleware:** `src/middleware.ts` → `apps/admin/middleware.ts` (the whole admin app
  is protected; simplify matcher to guard all routes + handle `/login`).
- **Features:** `pos`, `products`, `stock`, `purchasing`, `orders`, `customers`,
  `categories`, `discounts` (Client + actions; **only** `promotions.ts` left for shared),
  `reports`, `settings`, `dashboard`, `search`, `notifications`.
- **Components:** `components/layout/*` (AppShell, Sidebar, Topbar, `nav.ts` minus `Role`),
  `components/scan/*`, `components/charts/*`.
- **Lib (admin/POS only):** `barcode`, `catalog`, `catalog-cache`, `useCatalog`,
  `useHardwareScanner`, `csv`, `pos-queue`, `products-query`, `receipt`, `receipt-pdf`,
  `number-to-words`, `sound`.

### → `apps/storefront` (storefront-only)

- **Routes:** `src/app/(store)/*` becomes `apps/storefront/src/app/*` (the `(store)` group
  collapses — the store *is* the app now). `src/app/api/payments/*`,
  `src/app/api/cron/release-reservations`. Plus the **storefront** split of root
  `layout.tsx`/`providers.tsx`/`globals.css`. `app/page.tsx` becomes the real shop home
  (the `/→/shop` redirect is dropped).
- **Middleware:** optional, **session-refresh only** (storefront has no auth gate;
  customers are session-less, writes go through service-role server actions).
- **Features:** `features/storefront/{actions,order-actions}.ts`.
- **Components:** `components/store/*`.
- **Lib:** `lib/storefront.ts`, `lib/payments/{gateway,jazzcash,easypaisa,credit}.ts`
  (+ their tests). Note `payments/credit.ts` imports `notifications/dispatch` (shared) and
  storefront `order-actions`/`lib/storefront` — all storefront/shared, no admin dependency.

### → repo root (workspace-level, shared by both)

- `supabase/migrations/*` — **one** schema, single source of truth.
- `scripts/*` — DB tooling (`migrate`, `db`, `diagnose`, `reseed`, `setup-owner`) operate
  on the one DB.
- Docs (`*.md`), `.gitignore`, `.env.example`.

---

## 3. Workspace setup

### Tooling choice — **npm workspaces + Turborepo** (recommended)

- **npm workspaces** (required): the project already uses **npm** (`package-lock.json`).
  Workspaces are built into npm — zero new package manager, one lockfile, simplest
  professional option. Switching to pnpm/yarn would churn the lockfile and toolchain for
  no functional gain.
- **Turborepo** (recommended, thin layer): orchestrates and **caches** `build`/`lint`/
  `test`/`typecheck` across the two apps, with first-class Next.js support. Optional — the
  repo works on plain npm workspaces — but it makes CI and local builds fast and is the
  industry-standard pairing. If you want absolute minimalism, skip Turbo in Phase 1 and add
  it later; nothing else depends on it.

### Root `package.json` (shape)

```jsonc
{
  "name": "hamza-monorepo",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "db:migrate": "node scripts/migrate.mjs"
  },
  "devDependencies": { "turbo": "^2", "typescript": "^5.7", "dotenv": "^17" }
}
```

### `packages/shared/package.json` (shape)

```jsonc
{
  "name": "@hamza/shared",
  "version": "0.0.0",
  "private": true,
  "exports": {
    ".": "./src/index.ts",
    "./supabase/*": "./src/supabase/*.ts",
    "./ui/*": "./src/components/ui/*.tsx",
    "./theme": "./src/components/theme/index.ts",
    "./*": "./src/*.ts"
  }
}
```

- Shared is consumed as a **source package** (no build step) and transpiled by each app via
  Next.js **`transpilePackages: ["@hamza/shared"]`** in `apps/*/next.config.mjs`. This keeps
  `"use client"` / `"use server"` / `import "server-only"` directives intact across the
  boundary. (Alternative: compile shared to `dist` with `tsup` — more setup; not needed.)

### Per-app `package.json`

Each app (`@hamza/admin`, `@hamza/storefront`) has its own `next`, `react`, Tailwind, and
its **own dependency subset** (e.g. only the storefront depends on payment libs; only admin
on `@zxing/*`, `pdf-lib`, `recharts`). Both depend on `"@hamza/shared": "*"`.

### TypeScript config

- `tsconfig.base.json` at root: shared `compilerOptions`.
- Each app's `tsconfig.json` extends base and sets paths:
  - `@/*` → that app's `./src/*` (app-local code keeps the familiar alias),
  - `@hamza/shared` / `@hamza/shared/*` → `../../packages/shared/src/*`.
- This means **only imports that point at shared modules change**; everything app-local
  keeps `@/…`.

---

## 4. Import-path impact & strategy

**Scope:** of the ~443 `@/…` imports, the ones that must change are exactly those that
resolve to a **shared** module:
`@/lib/{supabase/*,auth,discounts,pricing,validation,utils,log,dates,notifications/*}`,
`@/components/ui/*`, `@/components/theme/*`, and `@/features/discounts/promotions`. App-local
imports (`@/components/layout`, `@/components/store`, `@/lib/barcode`, feature code, …) are
unchanged because each app keeps its own `@/*` alias.

**Rewrite mapping (mechanical):**

| Old import | New import |
|---|---|
| `@/lib/utils` | `@hamza/shared/utils` |
| `@/lib/supabase/server` | `@hamza/shared/supabase/server` |
| `@/components/ui/Button` | `@hamza/shared/ui/Button` |
| `@/components/theme/ThemeProvider` | `@hamza/shared/theme` |
| `@/features/discounts/promotions` | `@hamza/shared/promotions` |
| …(one row per shared module)… | … |

**Strategy to do it safely:**
1. Do it **per phase**, not all at once. When a module set moves to `packages/shared`,
   run a scripted find-replace for **just that mapping** across `src` (e.g.
   `jscodeshift`/`ts-morph`, or a reviewed `grep -rl … | sed` pass).
2. After each rewrite batch: `tsc --noEmit` (catches every missed/incorrect path) → fix →
   `next build` → run the 57-test Vitest suite. Commit the batch.
3. Keep batches small (one shared sub-area at a time: supabase, then ui, then the pure-util
   libs, then notifications, then promotions). A broken alias fails the build loudly and is
   trivially revertable.
4. Preserve file-top directives (`"use client"`, `"use server"`, `import "server-only"`)
   verbatim during moves — they are load-bearing.

---

## 5. Environment variables per app (names only)

| Variable | Scope | admin | storefront | Notes |
|---|---|:--:|:--:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | ✅ | ✅ | same project both apps |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | ✅ | ✅ | |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | ✅ | ✅ | **both** servers hold it (storefront writes via service role). Never `NEXT_PUBLIC`. |
| `NEXT_PUBLIC_APP_URL` | public | ✅ | ✅ | each set to its **own** domain; storefront's is used in **payment return URLs** |
| `NEXT_PUBLIC_APP_NAME` | public | ✅ | ✅ | |
| `NEXT_PUBLIC_CURRENCY` | public | ✅ | ✅ | |
| `WHATSAPP_TOKEN` | server-only | ✅ | ✅ | admin = receipt PDF send; storefront = order notifications (shared `notifications`) |
| `WHATSAPP_PHONE_NUMBER_ID` | server-only | ✅ | ✅ | as above |
| `RESEND_API_KEY` | server-only | ➖ | ✅ | order emails (also configurable in `settings` table) |
| `CRON_SECRET` | server-only | ➖ | ✅ | guards storefront `api/cron/release-reservations` |
| `SUPABASE_PROJECT_REF` | server-only (tooling) | root | root | DB scripts only |
| `SUPABASE_DB_PASSWORD` | server-only (tooling) | root | root | DB scripts only |
| **`NEXT_PUBLIC_ADMIN_URL`** (new) | public | — | ✅ | storefront "Staff login" link target |
| **`NEXT_PUBLIC_STORE_URL`** (new, optional) | public | ✅ | — | admin "view storefront" links |

- **Split rule:** `NEXT_PUBLIC_*` are build-time public (safe in the browser);
  everything else is server-only and must be set in each host's encrypted env, never
  prefixed `NEXT_PUBLIC_`.
- Payment provider keys (Stripe/JazzCash/Easypaisa) live in the **`settings` table**
  (`courier_keys`), not env — so they don't need per-app env duplication; only the
  storefront reads them at runtime.

---

## 6. Supabase clients / auth (moving without breaking RLS or service-role actions)

- **Clients move verbatim** into `packages/shared/src/supabase/` — behaviour is identical,
  only the import path changes. `admin.ts` keeps `import "server-only"` so the service-role
  key can never reach a client bundle; `client.ts` keeps `"use client"`.
- **RLS is unaffected.** RLS lives in the **database**, not the app. Admin keeps using the
  anon+session (`server.ts`/`client.ts`) clients (RLS-bound); storefront keeps using the
  service-role client in `"use server"` actions (intentionally bypasses RLS server-side).
  Relocating the files changes nothing about how policies evaluate.
- **Service-role server actions** (`features/storefront/*`, `lib/payments/credit.ts`,
  `notifications/dispatch`) keep their `"use server"` / server-only nature; they live in the
  storefront app (or shared) and run only on the storefront server. Verify the service-role
  key is present in **both** app environments after the split.
- **Admin auth / middleware:** `middleware.ts` moves into `apps/admin`. Because the admin
  app no longer co-hosts public routes, its matcher can guard **everything** (redirect
  unauthenticated → `/login`, authenticated-on-`/login` → `/dashboard`). Supabase auth
  cookies are scoped to the admin domain — fine for a standalone deployment.
- **Storefront auth:** none. A storefront `middleware.ts` is **optional** and would only
  refresh a Supabase session if any storefront SSR path used the cookie client; today it
  uses the service-role client, so storefront can ship **without** middleware.
- **`Role` type:** relocate from `components/layout/nav.ts` into shared `auth.ts` so the
  shared `auth` module no longer reaches into an admin component. `nav.ts` then imports
  `Role` from `@hamza/shared`.

---

## 7. Build & deploy (two domains, one DB)

- **Two independent Next.js builds.** Each app builds with its own `next.config.mjs`
  (+ `transpilePackages: ["@hamza/shared"]`) and Tailwind config (extending the shared
  preset; **content globs must include `../../packages/shared/**`** so shared UI classes
  aren't purged).
- **Netlify (two sites):** site A base dir `apps/admin`, site B base dir `apps/storefront`;
  build command `npm run build` (Turbo builds the app + its `@hamza/shared` dep), Next
  runtime via `@netlify/plugin-nextjs`; per-site env vars. **Cloudflare Pages** alternative:
  two projects with `@cloudflare/next-on-pages`, root dir per app.
- **Same Supabase project for both** → data stays in sync automatically; **no app-to-app
  API** required. (A web order's `HELD` reservation drops POS availability via the shared
  `stock_levels` cache and realtime publication.)
- **Domains:** e.g. `shop.example.com` (storefront) + `admin.example.com` (admin). Set each
  app's `NEXT_PUBLIC_APP_URL` to its own domain.
- **Hardcoded URLs / cross-links to fix:**
  - `app/page.tsx` `redirect("/shop")` → **delete** (storefront home becomes `/`).
  - `StoreFooter.tsx` `Link href="/login"` → point at **`NEXT_PUBLIC_ADMIN_URL`** (cross-
    domain), since `/login` no longer exists in the storefront app.
  - **Payment return URLs** (`lib/payments/gateway.ts` uses `NEXT_PUBLIC_APP_URL`) must
    resolve to the **storefront** domain so JazzCash/Easypaisa return to the right place.
  - Any admin "view storefront" link → optional `NEXT_PUBLIC_STORE_URL`.

---

## 8. Risk & rollback

**All work happens on `on-going-development`. `main` and `dev` are never touched until a
verified PR.** Each phase is its own commit (tag it, e.g. `phase-2-shared`).

| Risk | Mitigation / verify |
|---|---|
| Broken import path after a move | `tsc --noEmit` fails loudly; fix before commit. Small per-area batches. |
| Service-role key missing on one app | Smoke-test a storefront order placement + an admin server action after env setup. |
| Lost `"use client"`/`"use server"`/`server-only` directive | Diff each moved file; build surfaces RSC/`server-only` violations. |
| `@hamza/shared` not resolving in Next | Add `transpilePackages`; `next build` per app. |
| Tailwind purging shared UI styles | Add `packages/shared` to each app's `content` globs; visual check. |
| Cross-domain links broken (`/login`, payment return) | Manual click-through; verify a sandbox payment returns to storefront. |
| RLS/auth regressions | No policy changes; confirm admin still requires login and storefront stays public. |
| Realtime/availability drift between apps | Place a web order, confirm POS availability drops (shared DB test). |

**Rollback options (in order of preference):**
1. Per-phase commit → `git revert <phase commit>` (or `git reset --hard <prev phase tag>`)
   on `on-going-development`.
2. The monolith keeps working through Phases 1–2 (shared extraction inside the single app),
   so there's a working fallback until the app-split cutover (Phases 3–4).
3. Worst case, abandon the branch: `main`/`dev` remain the untouched single-app system.

**Verification gate after every phase:** `npm install` → `npm run typecheck` →
`npm run build` (all workspaces) → `npm test` (57 tests) → targeted manual smoke test for
that phase. Do not start the next phase until green.

---

## 9. Phased execution order (small, testable)

> Each phase = isolated, buildable, commit + tag, then verify before the next.

**Phase 0 — Prep (no moves).** Confirm on `on-going-development`; tag `pre-monorepo`.
Write/confirm `.env.example`. Decide app names/domains.
*Verify:* clean tree, current app still builds.

**Phase 1 — Workspace skeleton (no app code moved).** Add root `package.json`
(`workspaces`), `turbo.json`, `tsconfig.base.json`; create empty `packages/shared` and
`apps/` stubs. Keep the existing app running as-is for now.
*Verify:* `npm install` resolves the workspace; existing app still builds.

**Phase 2 — Extract `packages/shared` (app still monolithic).** Move the shared modules
(supabase, auth+`Role`, discounts, pricing, validation, utils, log, dates, notifications,
promotions, `components/ui`, `components/theme`, tailwind preset) into `packages/shared`.
Add `@hamza/shared` alias + `transpilePackages`. Rewrite **only** shared-targeted imports,
one sub-area at a time.
*Verify (highest-value gate):* `tsc`, `next build`, 57 tests, app runs — proves the shared
package is correct **before** any app split.

**Phase 3 — Carve `apps/admin`.** Move admin routes (`app/admin`, `login`,
`reset-password`, `api/catalog`), admin features, `components/{layout,scan,charts}`,
admin-only `lib/*`, admin root shell + middleware into `apps/admin` with its own
config. Wire to `@hamza/shared`.
*Verify:* admin builds and runs standalone; login gate works; POS sale, scan, receipt PDF,
reports all function.

**Phase 4 — Carve `apps/storefront`.** Move `(store)` routes (collapse the group to `app/`),
`features/storefront`, `components/store`, `lib/storefront`, `lib/payments`, `api/payments`,
`api/cron`, storefront root shell into `apps/storefront`. Fix cross-links (drop `/→/shop`
redirect; "Staff login" → `NEXT_PUBLIC_ADMIN_URL`; payment returns → storefront
`NEXT_PUBLIC_APP_URL`).
*Verify:* storefront builds/runs standalone; browse → cart → checkout → (sandbox) pay →
order confirmation; placing an order lowers POS availability in the admin app (shared-DB
test).

**Phase 5 — Root cleanup & deploy config.** Finalise root-level `supabase/migrations`,
`scripts`, docs; per-app `.env`; Netlify/Cloudflare site config per app; update
`.gitignore` (`apps/*/.next`). Turbo pipeline tuned.
*Verify:* both apps build via `turbo run build`; deploy previews on separate domains both
reach the same Supabase.

**Phase 6 — End-to-end QA & promote.** Full cross-app QA against one Supabase (POS sale,
udhaar, returns, web order → fulfilment, payment return, notifications). Then PR
`on-going-development → dev`, and after sign-off `dev → main`.
*Verify:* both deployments green on their domains; rollback plan still intact
(`main` unchanged throughout).

---

*End of plan. No application code, files, or git state were modified to produce this
document.*
