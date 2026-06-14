-- ============================================================
-- Hamza General Store — initial schema
-- Ledger-based inventory (append-only stock_moves -> stock_levels cache)
-- Postgres 15+ (Supabase).  See SCHEMA.md for the narrative.
-- ============================================================

create extension if not exists "pgcrypto";       -- gen_random_uuid()
create extension if not exists "pg_trgm";         -- fuzzy search on names/sku

-- ------------------------------------------------------------
-- ENUM TYPES
-- ------------------------------------------------------------
create type user_role          as enum ('owner','manager','cashier');
create type location_type      as enum ('PHYSICAL','SUPPLIER','CUSTOMER','LOSS','ADJUSTMENT','TRANSIT');
create type barcode_type       as enum ('UPC','EAN','INTERNAL','WEIGHT_EMBEDDED');
create type move_reference     as enum ('PURCHASE','SALE','ADJUSTMENT','TRANSFER','RETURN','COUNT','RESERVATION','OPENING');
create type move_source        as enum ('SCAN','MANUAL','API','IMPORT','SYSTEM');
create type costing_method     as enum ('WEIGHTED_AVERAGE','FIFO');
create type payment_method     as enum ('CASH','UDHAAR','CARD','COD','BANK');
create type ledger_entry_type  as enum ('CHARGE','PAYMENT');
create type po_status          as enum ('DRAFT','SENT','PARTIAL','RECEIVED','CANCELLED');
create type order_status       as enum ('PLACED','CONFIRMED','PACKED','SHIPPED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED','RTO','RETURNED');
create type reservation_status as enum ('HELD','COMMITTED','RELEASED');
create type shipment_status    as enum ('PENDING','BOOKED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','RTO','RETURNED');
create type discount_type      as enum ('PERCENT','FIXED','BOGO','FREE_DELIVERY');
create type discount_scope     as enum ('PRODUCT','CATEGORY','CART');
create type notification_channel as enum ('INAPP','EMAIL','WHATSAPP','SMS');
create type recipient_type     as enum ('ADMIN','CUSTOMER');

-- ------------------------------------------------------------
-- updated_at helper
-- ------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ------------------------------------------------------------
-- PROFILES (mirrors auth.users)
-- ------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  role        user_role not null default 'cashier',
  phone       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- Auto-create a profile row whenever an auth user is created
create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'cashier')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Role helpers (SECURITY DEFINER so policies can read profiles safely)
create or replace function current_role_of() returns user_role as $$
  select role from public.profiles where id = auth.uid();
$$ language sql stable security definer set search_path = public;

create or replace function is_staff() returns boolean as $$
  select exists(select 1 from public.profiles where id = auth.uid() and active);
$$ language sql stable security definer set search_path = public;

create or replace function is_owner_or_manager() returns boolean as $$
  select coalesce(current_role_of() in ('owner','manager'), false);
$$ language sql stable security definer set search_path = public;

create or replace function is_owner() returns boolean as $$
  select coalesce(current_role_of() = 'owner', false);
$$ language sql stable security definer set search_path = public;

-- ------------------------------------------------------------
-- LOCATIONS  (physical + virtual, double-entry endpoints)
-- ------------------------------------------------------------
create table locations (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  name       text not null,
  type       location_type not null,
  parent_id  uuid references locations(id),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- CATEGORIES
-- ------------------------------------------------------------
create table categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  parent_id  uuid references categories(id) on delete set null,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- PRODUCTS
-- ------------------------------------------------------------
create table products (
  id                 uuid primary key default gen_random_uuid(),
  sku                text unique not null,
  name               text not null,
  category_id        uuid references categories(id) on delete set null,
  base_unit          text not null default 'pcs',
  track_lots         boolean not null default false,
  is_variable_weight boolean not null default false,
  reorder_point      numeric(14,3) not null default 0,
  safety_stock       numeric(14,3) not null default 0,
  default_sale_price numeric(14,2) not null default 0,
  image_url          text,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index idx_products_name_trgm on products using gin (name gin_trgm_ops);
create index idx_products_category on products(category_id);
create trigger trg_products_updated before update on products
  for each row execute function set_updated_at();

create table product_barcodes (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  barcode    text not null unique,
  type       barcode_type not null default 'EAN',
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_barcodes_product on product_barcodes(product_id);

create table product_units (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  unit_name  text not null,            -- e.g. 'carton'
  factor     numeric(14,4) not null,   -- 1 carton = factor base units
  unique (product_id, unit_name)
);

create table lots (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  lot_number  text not null,
  expiry_date date,
  received_at timestamptz not null default now(),
  unique (product_id, lot_number)
);

-- ------------------------------------------------------------
-- STOCK LEDGER  (append-only)  +  cached levels
-- ------------------------------------------------------------
create table stock_moves (
  id               bigint generated always as identity primary key,
  product_id       uuid not null references products(id),
  lot_id           uuid references lots(id),
  qty              numeric(14,3) not null check (qty > 0),
  from_location_id uuid references locations(id),
  to_location_id   uuid references locations(id),
  unit_cost        numeric(14,4),
  reference_type   move_reference not null,
  reference_id     uuid,
  source           move_source not null default 'MANUAL',
  idempotency_key  text unique,
  note             text,
  created_by       uuid references profiles(id),
  created_at       timestamptz not null default now(),
  check (from_location_id is not null or to_location_id is not null)
);
create index idx_moves_product on stock_moves(product_id);
create index idx_moves_ref on stock_moves(reference_type, reference_id);
create index idx_moves_created on stock_moves(created_at);

create table stock_levels (
  product_id  uuid not null references products(id),
  location_id uuid not null references locations(id),
  lot_id      uuid references lots(id),
  on_hand     numeric(14,3) not null default 0,
  reserved    numeric(14,3) not null default 0,
  avg_cost    numeric(14,4) not null default 0,
  updated_at  timestamptz not null default now()
);
create unique index uq_stock_levels on stock_levels (product_id, location_id, lot_id) nulls not distinct;
create index idx_levels_location on stock_levels(location_id);

-- Append-only enforcement: no UPDATE / DELETE on the ledger
create or replace function block_ledger_mutation() returns trigger as $$
begin
  raise exception 'stock_moves is append-only; post a reversing entry instead';
end;
$$ language plpgsql;
create trigger trg_moves_no_update before update on stock_moves
  for each row execute function block_ledger_mutation();
create trigger trg_moves_no_delete before delete on stock_moves
  for each row execute function block_ledger_mutation();

-- Maintain stock_levels cache + weighted-average cost on every move
create or replace function apply_stock_move() returns trigger as $$
begin
  -- Outgoing leg: reduce on_hand at source
  if new.from_location_id is not null then
    insert into stock_levels(product_id, location_id, lot_id, on_hand, reserved, avg_cost)
    values (new.product_id, new.from_location_id, new.lot_id, -new.qty, 0, 0)
    on conflict (product_id, location_id, lot_id) do update
      set on_hand = stock_levels.on_hand - new.qty,
          updated_at = now();
  end if;

  -- Incoming leg: raise on_hand at destination + recompute moving average
  if new.to_location_id is not null then
    insert into stock_levels(product_id, location_id, lot_id, on_hand, reserved, avg_cost)
    values (new.product_id, new.to_location_id, new.lot_id, new.qty, 0, coalesce(new.unit_cost,0))
    on conflict (product_id, location_id, lot_id) do update
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
create trigger trg_apply_stock_move after insert on stock_moves
  for each row execute function apply_stock_move();

-- Available-to-promise per product across physical locations
create or replace view product_availability as
  select
    sl.product_id,
    sum(sl.on_hand)                  as on_hand,
    sum(sl.reserved)                 as reserved,
    sum(sl.on_hand - sl.reserved)    as available,
    case when sum(sl.on_hand) > 0
         then sum(sl.on_hand * sl.avg_cost) / nullif(sum(sl.on_hand),0)
         else 0 end                  as avg_cost
  from stock_levels sl
  join locations l on l.id = sl.location_id and l.type = 'PHYSICAL'
  group by sl.product_id;

-- ------------------------------------------------------------
-- SUPPLIERS + PURCHASING
-- ------------------------------------------------------------
create table suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text,
  address    text,
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table purchase_orders (
  id          uuid primary key default gen_random_uuid(),
  po_no       text unique not null,
  supplier_id uuid references suppliers(id),
  status      po_status not null default 'DRAFT',
  expected_at date,
  subtotal    numeric(14,2) not null default 0,
  total       numeric(14,2) not null default 0,
  notes       text,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_po_updated before update on purchase_orders
  for each row execute function set_updated_at();

create table purchase_order_items (
  id          uuid primary key default gen_random_uuid(),
  po_id       uuid not null references purchase_orders(id) on delete cascade,
  product_id  uuid not null references products(id),
  qty         numeric(14,3) not null,
  unit_cost   numeric(14,4) not null,
  received_qty numeric(14,3) not null default 0
);

create table goods_receipts (
  id          uuid primary key default gen_random_uuid(),
  grn_no      text unique not null,
  po_id       uuid references purchase_orders(id),
  supplier_id uuid references suppliers(id),
  location_id uuid not null references locations(id),
  received_by uuid references profiles(id),
  created_at  timestamptz not null default now()
);

create table goods_receipt_items (
  id          uuid primary key default gen_random_uuid(),
  grn_id      uuid not null references goods_receipts(id) on delete cascade,
  product_id  uuid not null references products(id),
  lot_id      uuid references lots(id),
  qty         numeric(14,3) not null,
  unit_cost   numeric(14,4) not null
);

-- ------------------------------------------------------------
-- CUSTOMERS + UDHAAR (khata)
-- ------------------------------------------------------------
create table customers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  phone          text,
  address        text,
  credit_limit   numeric(14,2) not null default 0,
  credit_balance numeric(14,2) not null default 0,   -- positive = owes us
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_customers_name_trgm on customers using gin (name gin_trgm_ops);
create trigger trg_customers_updated before update on customers
  for each row execute function set_updated_at();

create table customer_ledger (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id) on delete cascade,
  type          ledger_entry_type not null,
  amount        numeric(14,2) not null check (amount >= 0),
  reference     text,
  balance_after numeric(14,2) not null,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);
create index idx_cust_ledger on customer_ledger(customer_id, created_at);

-- ------------------------------------------------------------
-- POS SALES
-- ------------------------------------------------------------
create table sales (
  id           uuid primary key default gen_random_uuid(),
  receipt_no   text unique not null,
  customer_id  uuid references customers(id),
  location_id  uuid references locations(id),
  subtotal     numeric(14,2) not null default 0,
  discount     numeric(14,2) not null default 0,
  tax          numeric(14,2) not null default 0,
  total        numeric(14,2) not null default 0,
  cogs_total   numeric(14,2) not null default 0,
  profit       numeric(14,2) not null default 0,
  cashier_id   uuid references profiles(id),
  created_at   timestamptz not null default now()
);
create index idx_sales_created on sales(created_at);

create table sale_items (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid not null references sales(id) on delete cascade,
  product_id  uuid not null references products(id),
  qty         numeric(14,3) not null,
  unit_price  numeric(14,2) not null,
  unit_cogs   numeric(14,4) not null default 0,
  line_total  numeric(14,2) not null
);

create table payments (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid references sales(id) on delete cascade,
  order_id    uuid,
  method      payment_method not null,
  amount      numeric(14,2) not null,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- STOREFRONT MERCHANDISING (admin-controlled)
-- ------------------------------------------------------------
create table store_listings (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null unique references products(id) on delete cascade,
  is_published     boolean not null default false,
  online_price     numeric(14,2),
  title            text,
  slug             text unique,
  description      text,
  seo_title        text,
  seo_description  text,
  images           text[] not null default '{}',
  publish_at       timestamptz,
  unpublish_at     timestamptz,
  sort             int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger trg_listing_updated before update on store_listings
  for each row execute function set_updated_at();

create table collections (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique not null,
  sort       int not null default 0,
  active     boolean not null default true
);
create table collection_products (
  collection_id uuid references collections(id) on delete cascade,
  product_id    uuid references products(id) on delete cascade,
  sort          int not null default 0,
  primary key (collection_id, product_id)
);

create table homepage_sections (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,                -- 'featured' | 'collection' | 'banner'
  title      text,
  config     jsonb not null default '{}',
  sort       int not null default 0,
  active     boolean not null default true
);

create table banners (
  id         uuid primary key default gen_random_uuid(),
  title      text,
  image_url  text,
  link       text,
  sort       int not null default 0,
  active     boolean not null default true,
  start_at   timestamptz,
  end_at     timestamptz
);

-- ------------------------------------------------------------
-- DISCOUNTS
-- ------------------------------------------------------------
create table discounts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  type       discount_type not null,
  value      numeric(14,2) not null default 0,
  scope      discount_scope not null default 'CART',
  code       text unique,
  min_amount numeric(14,2) not null default 0,
  target_id  uuid,                           -- product or category id (per scope)
  start_at   timestamptz,
  end_at     timestamptz,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table discount_redemptions (
  id          uuid primary key default gen_random_uuid(),
  discount_id uuid not null references discounts(id) on delete cascade,
  order_id    uuid,
  sale_id     uuid references sales(id),
  amount      numeric(14,2) not null,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- ONLINE ORDERS + FULFILMENT
-- ------------------------------------------------------------
create table orders (
  id            uuid primary key default gen_random_uuid(),
  order_no      text unique not null,
  channel       text not null default 'web',
  customer_id   uuid references customers(id),
  customer_name text not null,
  customer_phone text not null,
  address       text,
  status        order_status not null default 'PLACED',
  payment_type  payment_method not null default 'COD',
  subtotal      numeric(14,2) not null default 0,
  discount      numeric(14,2) not null default 0,
  delivery_fee  numeric(14,2) not null default 0,
  total         numeric(14,2) not null default 0,
  discount_id   uuid references discounts(id),
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_orders_status on orders(status);
create trigger trg_orders_updated before update on orders
  for each row execute function set_updated_at();

create table order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  product_id  uuid not null references products(id),
  qty         numeric(14,3) not null,
  unit_price  numeric(14,2) not null,
  line_total  numeric(14,2) not null
);

create table reservations (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references orders(id) on delete cascade,
  product_id  uuid not null references products(id),
  qty         numeric(14,3) not null,
  status      reservation_status not null default 'HELD',
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index idx_reservations_order on reservations(order_id);

create table shipments (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders(id) on delete cascade,
  courier        text,
  tracking_no    text,
  status         shipment_status not null default 'PENDING',
  cod_amount     numeric(14,2) not null default 0,
  settled_amount numeric(14,2) not null default 0,
  settled_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_shipments_updated before update on shipments
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- NOTIFICATIONS + AUDIT + SETTINGS
-- ------------------------------------------------------------
create table notifications (
  id             uuid primary key default gen_random_uuid(),
  recipient_type recipient_type not null,
  recipient_id   uuid,
  event          text not null,
  title          text not null,
  body           text,
  channel        notification_channel not null default 'INAPP',
  payload        jsonb not null default '{}',
  read_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index idx_notif_recipient on notifications(recipient_id, read_at);

create table audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor      uuid references profiles(id),
  action     text not null,
  entity     text not null,
  entity_id  text,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_entity on audit_log(entity, entity_id);

create table settings (
  id             int primary key default 1 check (id = 1),  -- singleton
  store_name     text not null default 'Hamza General Store',
  costing_method costing_method not null default 'WEIGHTED_AVERAGE',
  currency       text not null default 'PKR',
  tax_percent    numeric(5,2) not null default 0,
  store_info     jsonb not null default '{}',
  courier_keys   jsonb not null default '{}',
  notif_prefs    jsonb not null default '{}',
  updated_at     timestamptz not null default now()
);
create trigger trg_settings_updated before update on settings
  for each row execute function set_updated_at();
