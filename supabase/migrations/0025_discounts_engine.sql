-- ------------------------------------------------------------
-- Discounts engine — promotions across POS + storefront
-- ------------------------------------------------------------
-- The discounts table already carries name/type/value/scope/code/min_amount/
-- target_id/start_at/end_at/active. Add the few fields a real promotions engine
-- needs (Buy-X-Get-Y quantities, a short description) and richer usage tracking
-- on the existing discount_redemptions ledger.

alter table discounts
  add column if not exists buy_qty             integer not null default 1,
  add column if not exists get_qty             integer not null default 1,
  add column if not exists get_discount_percent numeric(5,2) not null default 100,
  add column if not exists description         text;

comment on column discounts.buy_qty is 'Buy-X-Get-Y: quantity that must be bought.';
comment on column discounts.get_qty is 'Buy-X-Get-Y: quantity discounted for each buy_qty bought.';
comment on column discounts.get_discount_percent is 'Buy-X-Get-Y: percent off the "get" units (100 = free).';

-- Redemption ledger: which channel applied it, and the profit on the sale it
-- discounted (POS sales carry profit; web orders leave it null for now).
alter table discount_redemptions
  add column if not exists channel text not null default 'POS',
  add column if not exists profit  numeric(14,2);

create index if not exists idx_redemptions_discount on discount_redemptions(discount_id);

-- Per-discount usage rollup for the admin Discounts tab.
create or replace view discount_usage as
  select
    d.id                                   as discount_id,
    count(r.id)                            as times_applied,
    coalesce(sum(r.amount), 0)::numeric(14,2)  as total_discount,
    coalesce(sum(r.profit), 0)::numeric(14,2)  as profit_after
  from discounts d
  left join discount_redemptions r on r.discount_id = d.id
  group by d.id;
