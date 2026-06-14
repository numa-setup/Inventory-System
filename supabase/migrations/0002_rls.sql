-- ============================================================
-- Row Level Security
-- Baseline: authenticated active staff can read operational data;
-- writes are gated by role (owner/manager) for sensitive tables.
-- Privileged server actions use the service_role key (bypasses RLS).
-- Storefront anon (public) read policies are added in a later migration.
-- ============================================================

-- Enable RLS on every public table
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- Generic "staff can read" SELECT policy on all operational tables
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename not in ('profiles','settings','audit_log')
  loop
    execute format(
      'create policy "staff read" on public.%I for select to authenticated using (is_staff());', t);
  end loop;
end $$;

-- PROFILES
create policy "read own or staff" on profiles for select to authenticated
  using (id = auth.uid() or is_owner_or_manager());
create policy "update own basic" on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "owner manage profiles" on profiles for all to authenticated
  using (is_owner()) with check (is_owner());

-- SETTINGS — staff read, owner write
create policy "staff read settings" on settings for select to authenticated
  using (is_staff());
create policy "owner write settings" on settings for all to authenticated
  using (is_owner()) with check (is_owner());

-- AUDIT LOG — owner/manager read only; inserts via service role
create policy "managers read audit" on audit_log for select to authenticated
  using (is_owner_or_manager());

-- Owner/manager full write on catalogue & operational management tables
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'locations','categories','products','product_barcodes','product_units','lots',
      'suppliers','purchase_orders','purchase_order_items','goods_receipts','goods_receipt_items',
      'store_listings','collections','collection_products','homepage_sections','banners',
      'discounts','discount_redemptions','orders','order_items','reservations','shipments'
    ])
  loop
    execute format(
      'create policy "managers write" on public.%I for all to authenticated using (is_owner_or_manager()) with check (is_owner_or_manager());', t);
  end loop;
end $$;

-- Cashier-capable tables (POS): any active staff may insert
do $$
declare t text;
begin
  for t in
    select unnest(array['sales','sale_items','payments','customers','customer_ledger','stock_moves'])
  loop
    execute format(
      'create policy "staff insert" on public.%I for insert to authenticated with check (is_staff());', t);
  end loop;
end $$;
-- Customers can also be updated by managers
create policy "managers update customers" on customers for update to authenticated
  using (is_owner_or_manager()) with check (is_owner_or_manager());

-- NOTIFICATIONS — recipients read their own; staff read admin notifications
create policy "read own notifications" on notifications for select to authenticated
  using (recipient_id = auth.uid() or (recipient_type = 'ADMIN' and is_staff()));
create policy "mark own read" on notifications for update to authenticated
  using (recipient_id = auth.uid() or (recipient_type = 'ADMIN' and is_staff()))
  with check (true);
