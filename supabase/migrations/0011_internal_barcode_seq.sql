-- ------------------------------------------------------------
-- Round 3 / Section 2 — internal barcode sequence
-- ------------------------------------------------------------
-- Items with no manufacturer barcode get an internal code generated in the app
-- (GS1 prefix-2 EAN-13, or a weight template for variable-weight items). This
-- sequence hands out the unique numeric ref; an RPC exposes nextval to the
-- service-role client (which can't run raw SQL).

create sequence if not exists internal_barcode_seq start 1000 increment 1;

create or replace function next_internal_barcode() returns bigint
  language sql as $$ select nextval('internal_barcode_seq'); $$;
