-- ------------------------------------------------------------
-- Round 3 / Section 3 — counter returns / refunds
-- ------------------------------------------------------------
-- A return reverses part (or all) of a sale: stock goes back into inventory via
-- a RETURN stock move (move_reference already has 'RETURN') and the refund is
-- recorded. These tables capture the return for reporting and to cap how much of
-- each line can still be returned.

create table if not exists sale_returns (
  id            uuid primary key default gen_random_uuid(),
  sale_id       uuid references sales(id),
  receipt_no    text not null,
  total         numeric(14,2) not null default 0,
  refund_method payment_method not null default 'CASH',
  reason        text,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);

create table if not exists sale_return_items (
  id           uuid primary key default gen_random_uuid(),
  return_id    uuid not null references sale_returns(id) on delete cascade,
  sale_item_id uuid references sale_items(id),
  product_id   uuid not null references products(id),
  variant_id   uuid references product_variants(id),
  qty          numeric(14,3) not null check (qty > 0),
  unit_price   numeric(14,2) not null,
  unit_cogs    numeric(14,4) not null default 0,
  line_total   numeric(14,2) not null
);

create index if not exists idx_returns_sale on sale_returns(sale_id);
create index if not exists idx_return_items_return on sale_return_items(return_id);
create index if not exists idx_return_items_sale_item on sale_return_items(sale_item_id);
