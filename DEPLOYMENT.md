# Deployment

This repo is an npm-workspaces monorepo:

- `apps/admin` — inventory + POS (the **only** app wired for deploy right now)
- `apps/storefront` — customer e-commerce (deploy config intentionally **not** set up yet)
- `packages/shared` — shared code consumed by both apps

Both apps talk to the **same** hosted Supabase project. Deploying `apps/admin` does
not require touching the storefront.

---

## Deploy `apps/admin` to Cloudflare Pages

`apps/admin` deploys as its **own** Cloudflare Pages project using the official
Next.js-on-Cloudflare adapter, [`@cloudflare/next-on-pages`]. Every server route in
the admin app runs on the Cloudflare **Workers (Edge) runtime** — this is enforced by
`export const runtime = "edge"` on the root layout (`src/app/layout.tsx`, inherited by
all pages) and on the one route handler (`src/app/api/catalog/route.ts`). No Node-only
APIs are used (Web Crypto, `fetch`, and the pure-JS `pdf-lib` only), so the whole app
is Edge-compatible.

### 1. Cloudflare Pages dashboard — Build configuration

Create a new Pages project → **Connect to Git** → pick this repository, then set:

| Setting | Value |
|---|---|
| **Production branch** | `on-going-development` (switch to `main` when you go live) |
| **Framework preset** | Next.js |
| **Root directory** | `apps/admin` |
| **Build command** | `npx @cloudflare/next-on-pages` |
| **Build output directory** | `.vercel/output/static` |
| **Install command** | leave default (`npm install`) |

Notes:
- **Root directory = `apps/admin`.** Cloudflare clones the whole repo and runs the
  build from that folder. `npm install` walks up to the workspace root, so the
  `@hamza/shared` workspace package resolves automatically.
- If the build ever can't find `@hamza/shared`, use this monorepo fallback instead:
  Root directory = repo root, Build command = `npm install && npm run pages:build -w @hamza/admin`,
  Build output directory = `apps/admin/.vercel/output/static`.
- Set **`NODE_VERSION` = `20`** (Pages → Settings → Environment variables, or a
  repo-root `.nvmrc`). `next-on-pages` needs Node 18+.

### 2. Compatibility flags (Pages → Settings → Functions)

Set these for **both** Production and Preview (they mirror `apps/admin/wrangler.toml`):

| Setting | Value |
|---|---|
| **Compatibility date** | `2024-12-30` |
| **Compatibility flags** | `nodejs_compat` |

`nodejs_compat` is required so the Workers runtime can polyfill the Node built-ins
Next.js and its dependencies expect.

### 3. Environment variables (Pages → Settings → Environment variables)

Set these in the dashboard for **Production** (and **Preview** if you use preview
deploys). All point at the **existing shared Supabase project** — do not create a new
one. Values are never committed; only the names below (and in `apps/admin/.env.example`)
live in git.

**Public — exposed to the browser (`NEXT_PUBLIC_*`):**

| Name | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (shared project) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `NEXT_PUBLIC_APP_URL` | This admin deploy's own public URL (used in password-reset links), e.g. `https://admin.yourdomain.com` |
| `NEXT_PUBLIC_APP_NAME` | Optional — display name |
| `NEXT_PUBLIC_CURRENCY` | Optional — currency label (e.g. `PKR`) |

**Server-only — secret, never prefix with `NEXT_PUBLIC` (mark as "Encrypt" in the dashboard):**

| Name | Notes |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged Supabase key for server actions + auth admin |
| `ADMIN_OTP_SECRET` | Signs the OTP-verified session cookie (2nd factor). Long random string. **Required** or the admin is unreachable |
| `RESEND_API_KEY` | Resend key — sends login OTP + password-reset emails |
| `AUTH_EMAIL_FROM` | Verified Resend sender, e.g. `Hamza Store <noreply@yourdomain.com>` |
| `WHATSAPP_TOKEN` | Optional — WhatsApp Cloud API token for sending receipt PDFs; send is cleanly stubbed if unset |
| `WHATSAPP_PHONE_NUMBER_ID` | Optional — WhatsApp Cloud API phone-number id |

**Not needed on Cloudflare** (local-only, used by `node scripts/create-admin.mjs` to seed
the first admin): `ADMIN_EMAIL`, `ADMIN_PASSWORD`. Run that script locally once, then
clear them.

### 4. Custom domain

Pages → **Custom domains** → add the admin domain (e.g. `admin.yourdomain.com`).
After it resolves, set `NEXT_PUBLIC_APP_URL` to that exact URL and redeploy so the
password-reset email links are correct.

### 5. Scheduled tasks (cron)

`apps/admin` has **no** scheduled task, so **no cron / Cron Triggers configuration is
needed** for this deploy. (The only cron in the repo is the storefront's
`/api/cron/release-reservations`, which is out of scope until the storefront is
deployed separately.)

---

## Local commands

From `apps/admin`:

```bash
npm run pages:build     # produce the Cloudflare build (.vercel/output/static)
npm run pages:preview   # build, then serve locally with `wrangler pages dev`
npm run pages:deploy    # build, then `wrangler pages deploy` (direct upload)
```

> **Windows note:** `@cloudflare/next-on-pages` runs the Vercel build under the hood,
> which needs symlink support. On Windows that requires **Developer Mode** (Settings →
> Privacy & security → For developers) **or** running the build under **WSL** — the CLI
> warns about this. CI and the Cloudflare dashboard build run on Linux, where this is a
> non-issue. The build otherwise compiles cleanly: all routes are Edge-compatible with
> no runtime incompatibilities.

[`@cloudflare/next-on-pages`]: https://github.com/cloudflare/next-on-pages
