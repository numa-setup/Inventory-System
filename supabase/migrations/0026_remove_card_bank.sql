-- ------------------------------------------------------------
-- Part 4 — remove Card and Bank Transfer (and the unused Wallet)
-- ------------------------------------------------------------
-- The till keeps Cash / Easypaisa / JazzCash / Udhaar (+ Split); the storefront
-- keeps Cash-on-Delivery / Easypaisa / JazzCash. CARD, BANK and WALLET are gone
-- from the UI and logic — this drops them from the stored enum too.
--
-- Guarded so it runs exactly once: if CARD is already absent the block is a no-op,
-- which keeps migrate.mjs idempotent. payment_method is used by payments.method,
-- orders.payment_type (default COD) and sale_returns.refund_method (default CASH).

do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'payment_method' and e.enumlabel = 'CARD'
  ) then
    -- 1. Move any existing rows off the methods being removed.
    update orders       set payment_type  = 'COD'       where payment_type  in ('CARD', 'BANK', 'WALLET');
    update payments     set method        = 'CASH'      where method        in ('CARD', 'BANK');
    update payments     set method        = 'EASYPAISA' where method        =  'WALLET';
    update sale_returns set refund_method = 'CASH'      where refund_method in ('CARD', 'BANK', 'WALLET');

    -- 2. Recreate the enum without CARD / BANK / WALLET.
    alter type payment_method rename to payment_method_old;
    create type payment_method as enum ('CASH', 'UDHAAR', 'COD', 'JAZZCASH', 'EASYPAISA');

    alter table orders       alter column payment_type  drop default;
    alter table sale_returns alter column refund_method drop default;

    alter table payments     alter column method        type payment_method using method::text::payment_method;
    alter table orders       alter column payment_type  type payment_method using payment_type::text::payment_method;
    alter table sale_returns alter column refund_method type payment_method using refund_method::text::payment_method;

    alter table orders       alter column payment_type  set default 'COD';
    alter table sale_returns alter column refund_method set default 'CASH';

    drop type payment_method_old;
  end if;
end $$;
