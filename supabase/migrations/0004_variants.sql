-- ============================================================
-- 0004 — Product variants (size / shade / flavor / color)
-- Stock now lives at the VARIANT level, not the product level.
--
-- Data-preserving upgrade:
--   * products becomes a parent grouping (+ brand, description, has_variants)
--   * every existing product gets ONE auto-created is_default variant
--   * all stock-related rows are repointed to that default variant
--   * stock_moves gets a BEFORE-insert trigger that fills variant_id from the
--     product's default variant when older code only supplies product_id,
--     so POS / receiving keep working until each feature is made variant-native.
-- See SCHEMA.md for the narrative + diagram.
-- ============================================================

-- ------------------------------------------------------------
-- 1. products: parent grouping fields
-- ------------------------------------------------------------
alter table products add column if not exists brand        text;
alter table products add column if not exists description  text;
alter table products add column if not exists has_variants boolean not null default false;

-- ------------------------------------------------------------
-- 2. New variant model tables
-- ------------------------------------------------------------
create table if not exists product_options (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name       text not null,                 -- 'Shade' | 'Size' | 'Flavor' | 'Color'
  sort       int  not null default 0,
  unique (product_id, name)
);
create index if not exists idx_options_product on product_options(product_id);

create table if not exists product_option_values (
  id         uuid primary key default gen_random_uuid(),
  option_id  uuid not null references product_options(id) on delete cascade,
  value      text not null,                 -- 'Ruby Red' | '3.5g'
  sort       int  not null default 0,
  unique (option_id, value)
);
create index if not exists idx_optvals_option on product_option_values(option_id);

create table if not exists product_variants (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products(id) on delete cascade,
  sku           text unique not null,
  cost          numeric(14,4) not null default 0,   -- last/standard cost (avg cost lives on stock_levels)
  sale_price    numeric(14,2) not null default 0,
  reorder_point numeric(14,3) not null default 0,
  is_default    boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_variants_product on product_variants(product_id);
-- exactly one default variant per product
create unique index if not exists uq_variant_default
  on product_variants(product_id) where is_default;
create trigger trg_variants_updated before update on product_variants
  for each row execute function set_updated_at();

create table if not exists variant_option_values (
  variant_id      uuid not null references product_variants(id) on delete cascade,
  option_value_id uuid not null references product_option_values(id) on delete cascade,
  primary key (variant_id, option_value_id)
);

-- ------------------------------------------------------------
-- 3. Add variant_id to every stock-related table (nullable for backfill)
-- ------------------------------------------------------------
alter table product_barcodes     add column if not exists variant_id uuid references product_variants(id) on delete cascade;
alter table lots                 add column if not exists variant_id uuid references product_variants(id) on delete cascade;
alter table stock_moves          add column if not exists variant_id uuid references product_variants(id);
alter table stock_levels         add column if not exists variant_id uuid references product_variants(id);
alter table sale_items           add column if not exists variant_id uuid references product_variants(id);
alter table order_items          add column if not exists variant_id uuid references product_variants(id);
alter table reservations         add column if not exists variant_id uuid references product_variants(id);
alter table purchase_order_items add column if not exists variant_id uuid references product_variants(id);
alter table goods_receipt_items  add column if not exists variant_id uuid references product_variants(id);

-- ------------------------------------------------------------
-- 4. Backfill: one default variant per existing product
-- ------------------------------------------------------------
insert into product_variants (product_id, sku, sale_price, reorder_point, is_default, active)
select p.id, p.sku, p.default_sale_price, p.reorder_point, true, p.active
from products p
where not exists (select 1 from product_variants v where v.product_id = p.id);

-- seed default-variant cost from current weighted-average physical cost
update product_variants v
set cost = sub.c
from (
  select sl.product_id,
         case when sum(sl.on_hand) > 0
              then sum(sl.on_hand * sl.avg_cost) / sum(sl.on_hand) else 0 end as c
  from stock_levels sl
  join locations l on l.id = sl.location_id and l.type = 'PHYSICAL'
  group by sl.product_id
) sub
where sub.product_id = v.product_id and v.is_default and sub.c > 0;

-- ------------------------------------------------------------
-- 5. Repoint existing rows to the default variant
-- ------------------------------------------------------------
update product_barcodes b     set variant_id = v.id from product_variants v where v.product_id = b.product_id     and v.is_default and b.variant_id is null;
update lots l                 set variant_id = v.id from product_variants v where v.product_id = l.product_id     and v.is_default and l.variant_id is null;

-- stock_moves is append-only; suspend the guard only for this in-place backfill
alter table stock_moves disable trigger trg_moves_no_update;
update stock_moves m          set variant_id = v.id from product_variants v where v.product_id = m.product_id     and v.is_default and m.variant_id is null;
alter table stock_moves enable trigger trg_moves_no_update;

update stock_levels s         set variant_id = v.id from product_variants v where v.product_id = s.product_id     and v.is_default and s.variant_id is null;
update sale_items si          set variant_id = v.id from product_variants v where v.product_id = si.product_id    and v.is_default and si.variant_id is null;
update order_items oi         set variant_id = v.id from product_variants v where v.product_id = oi.product_id    and v.is_default and oi.variant_id is null;
update reservations r         set variant_id = v.id from product_variants v where v.product_id = r.product_id     and v.is_default and r.variant_id is null;
update purchase_order_items p set variant_id = v.id from product_variants v where v.product_id = p.product_id     and v.is_default and p.variant_id is null;
update goods_receipt_items g  set variant_id = v.id from product_variants v where v.product_id = g.product_id     and v.is_default and g.variant_id is null;

-- ------------------------------------------------------------
-- 6. Re-key stock_levels cache on the variant
-- ------------------------------------------------------------
drop index if exists uq_stock_levels;
create unique index if not exists uq_stock_levels_variant
  on stock_levels (variant_id, location_id, lot_id) nulls not distinct;
create index if not exists idx_levels_variant on stock_levels(variant_id);

-- ------------------------------------------------------------
-- 7. Backward-compat: fill variant_id <-> product_id on stock_moves
-- ------------------------------------------------------------
create or replace function fill_move_variant() returns trigger as $$
declare v uuid; p uuid;
begin
  if new.variant_id is null and new.product_id is not null then
    select id into v from product_variants
      where product_id = new.product_id and is_default limit 1;
    new.variant_id := v;
  end if;
  if new.product_id is null and new.variant_id is not null then
    select product_id into p from product_variants where id = new.variant_id;
    new.product_id := p;
  end if;
  if new.variant_id is null then
    raise exception 'stock_moves needs a variant_id (or a product_id with a default variant)';
  end if;
  return new;
end;
$$ language plpgsql;
create trigger trg_fill_move_variant before insert on stock_moves
  for each row execute function fill_move_variant();

-- ------------------------------------------------------------
-- 8. Maintain stock_levels keyed by variant (weighted-average cost)
-- ------------------------------------------------------------
create or replace function apply_stock_move() returns trigger as $$
begin
  -- Outgoing leg
  if new.from_location_id is not null then
    insert into stock_levels(product_id, variant_id, location_id, lot_id, on_hand, reserved, avg_cost)
    values (new.product_id, new.variant_id, new.from_location_id, new.lot_id, -new.qty, 0, 0)
    on conflict (variant_id, location_id, lot_id) do update
      set on_hand = stock_levels.on_hand - new.qty,
          updated_at = now();
  end if;

  -- Incoming leg + moving average
  if new.to_location_id is not null then
    insert into stock_levels(product_id, variant_id, location_id, lot_id, on_hand, reserved, avg_cost)
    values (new.product_id, new.variant_id, new.to_location_id, new.lot_id, new.qty, 0, coalesce(new.unit_cost,0))
    on conflict (variant_id, location_id, lot_id) do update
      set on_hand = stock_levels.on_hand + new.qty,
          avg_cost = case
            when new.unit_cost is not null and (stock_levels.on_hand + new.qty) > 0
              then ((greatest(stock_levels.on_hand,0) * stock_levels.avg_cost)
                    + (new.qty * new.unit_cost))
                   / (greatest(stock_levels.on_hand,0) + new.qty)
            else stock_levels.avg_cost
          end,
          updated_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

-- ------------------------------------------------------------
-- 9. Availability views (variant-level + product rollup for back-compat)
-- ------------------------------------------------------------
create or replace view variant_availability as
  select
    sl.variant_id,
    sum(sl.on_hand)               as on_hand,
    sum(sl.reserved)              as reserved,
    sum(sl.on_hand - sl.reserved) as available,
    case when sum(sl.on_hand) > 0
         then sum(sl.on_hand * sl.avg_cost) / nullif(sum(sl.on_hand),0)
         else 0 end               as avg_cost
  from stock_levels sl
  join locations l on l.id = sl.location_id and l.type = 'PHYSICAL'
  group by sl.variant_id;

create or replace view product_availability as
  select
    pv.product_id,
    sum(sl.on_hand)               as on_hand,
    sum(sl.reserved)              as reserved,
    sum(sl.on_hand - sl.reserved) as available,
    case when sum(sl.on_hand) > 0
         then sum(sl.on_hand * sl.avg_cost) / nullif(sum(sl.on_hand),0)
         else 0 end               as avg_cost
  from stock_levels sl
  join product_variants pv on pv.id = sl.variant_id
  join locations l on l.id = sl.location_id and l.type = 'PHYSICAL'
  group by pv.product_id;

-- ------------------------------------------------------------
-- 10. RLS for the new variant tables (mirror catalogue policies)
-- ------------------------------------------------------------
do $$
declare t text;
begin
  for t in select unnest(array[
    'product_options','product_option_values','product_variants','variant_option_values'
  ]) loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy "staff read" on public.%I for select to authenticated using (is_staff());', t);
    execute format('create policy "managers write" on public.%I for all to authenticated using (is_owner_or_manager()) with check (is_owner_or_manager());', t);
  end loop;
end $$;
