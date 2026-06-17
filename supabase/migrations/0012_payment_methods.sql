-- ------------------------------------------------------------
-- Round 3 / Section 3 — extra payment methods
-- ------------------------------------------------------------
-- Local wallets for mixed/split payments. Split itself needs no schema change:
-- the payments table already allows multiple rows per sale.

alter type payment_method add value if not exists 'JAZZCASH';
alter type payment_method add value if not exists 'EASYPAISA';
alter type payment_method add value if not exists 'WALLET';
