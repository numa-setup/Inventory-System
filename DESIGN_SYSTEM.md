# Design System

Sampled from `/attached_design_refrences` (MaterialUIUX). Encoded as CSS
variables (`src/app/globals.css`) + a Tailwind theme (`tailwind.config.ts`).

## Fonts

- **Headings / KPI numbers:** Plus Jakarta Sans (`font-heading`)
- **Body / data / tables:** Inter (`font-body`)

Loaded via `next/font/google` in `src/app/layout.tsx`, exposed as
`--font-heading` / `--font-body`.

## Color tokens

Semantic tokens flip between light and dark (CSS variables). Brand + accent
ramps are constants.

| Token | Light | Dark | Tailwind |
|-------|-------|------|----------|
| Page bg | `#EEF1FB` | `#0E1222` | `bg-page` |
| Surface | `#FFFFFF` | `#161B2E` | `bg-surface` |
| Surface-2 | `#F7F9FE` | `#1C2238` | `bg-surface-2` |
| Border | `#E6E9F4` | `#2A3150` | `border-border` |
| Text primary | `#1C2138` | `#EEF1FB` | `text-text-primary` |
| Text secondary | `#6B7280` | `#A8B0C8` | `text-text-secondary` |
| Text tertiary | `#9AA0B4` | `#6B7290` | `text-text-tertiary` |

**Brand blue** (`brand-50…700`): primary buttons, active sidebar pill. `500 #1863D5`.

**Accent ramps** `{ tile, icon, text }` — KPI tiles, status pills, chips:

| Accent | tile | icon | text | Used for |
|--------|------|------|------|----------|
| blue | `#E7EEFC` | `#1863D5` | `#0B5BBE` | primary KPIs |
| teal | `#E0F2F8` | `#0E9BC0` | `#0A7C99` | info |
| green | `#E7F6EA` | `#16A34A` | `#076809` | success / paid / delivered |
| amber | `#FCEFD9` | `#D97706` | `#B45309` | warning / processing |
| coral | `#FCE9E7` | `#E2615B` | `#B42318` | danger / cancelled / RTO |
| purple | `#F3E9FA` | `#7C3AED` | `#6D28D9` | accent |

In code: `ACCENT_TILE[...]` (classes) and `ACCENT_HEX[...]` (literals for charts)
in `src/components/ui/accent.ts`.

## Shape & elevation

- Radius: cards `2xl` (16px), inputs/buttons `lg` (10px), pills full.
- Shadows: very soft only (`shadow-card`). Lean on borders, not shadows.

## Dark mode

Class strategy (`.dark` on `<html>`). `ThemeProvider` persists to
`localStorage` (`hgs-theme`); an inline script in `<head>` applies it before
paint to avoid flash. Toggle lives in the Topbar.

## Layout

- **Sidebar** — icon + label, active = solid brand pill; collapses to a drawer
  under `lg`.
- **Topbar** — search, dark toggle, notification bell (red badge), profile.
- **Content** — responsive card grid, mobile-first (360px → 1440px+).

## Component library (`src/components/ui`)

`Card` family · `Button` · `Input`/`Label`/`FieldError` · `StatTile` ·
`StatusPill` (+ `STATUS_TONE` map) · `DataTable` · `Avatar` · `EmptyState` ·
`Skeleton`. Charts: `AreaTrend`, `BarTrend`, `DonutChart`. Layout: `Sidebar`,
`Topbar`, `AppShell`.

Add new primitives here rather than styling ad-hoc, so screens stay consistent.
Still to add as needed: `Drawer`, `Modal`, `Toast`, `FilterBar`, `ExportMenu`,
`Select`, radar/map charts.
