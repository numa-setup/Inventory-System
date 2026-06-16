-- ============================================================
-- 0007 — Purchasing depth: rich suppliers + payable ledger
-- (PO and GRN items already carry variant_id from 0004.)
-- ============================================================

-- ------------------------------------------------------------
-- Rich supplier records
-- ------------------------------------------------------------
alter table suppliers add column if not exists contact_person  text;
alter table suppliers add column if not exists email           text;
alter table suppliers add column if not exists city            text;
alter table suppliers add column if not exists ntn             text;             -- tax / NTN number
alter table suppliers add column if not exists payment_terms   text;             -- e.g. '30 days'
alter table suppliers add column if not exists bank_details    text;
alter table suppliers add column if not exists opening_balance numeric(14,2) not null default 0;
alter table suppliers add column if not exists balance         numeric(14,2) not null default 0; -- payable; +ve = we owe them

-- seed running balance from any opening balance
update suppliers set balance = opening_balance where balance = 0 and opening_balance <> 0;

-- ------------------------------------------------------------
-- Supplier ledger (what we owe / what we paid) — mirrors customer_ledger
-- ------------------------------------------------------------
create table if not exists supplier_ledger (
  id            uuid primary key default gen_random_uuid(),
  supplier_id   uuid not null references suppliers(id) on delete cascade,
  type          ledger_entry_type not null,           -- CHARGE = goods received, PAYMENT = we paid
  amount        numeric(14,2) not null check (amount >= 0),
  reference     text,
  balance_after numeric(14,2) not null,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_sup_ledger on supplier_ledger(supplier_id, created_at);

-- ------------------------------------------------------------
-- Goods receipt totals (handy for history without re-summing)
-- ------------------------------------------------------------
alter table goods_receipts add column if not exists total numeric(14,2) not null default 0;
alter table goods_receipts add column if not exists note  text;

-- ------------------------------------------------------------
-- RLS for the new ledger table
-- ------------------------------------------------------------
alter table supplier_ledger enable row level security;
create policy "staff read" on supplier_ledger for select to authenticated using (is_staff());
create policy "managers write" on supplier_ledger for all to authenticated
  using (is_owner_or_manager()) with check (is_owner_or_manager());
