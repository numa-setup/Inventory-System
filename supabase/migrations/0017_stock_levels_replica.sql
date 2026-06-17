-- ------------------------------------------------------------
-- Fix: stock_levels has no primary key but is in the supabase_realtime
-- publication (migration 0008). Postgres rejects published UPDATE/DELETE on a
-- table without a replica identity — which broke the reservation trigger's
-- plain UPDATE of stock_levels.reserved (and is a latent risk for any other
-- direct update). REPLICA IDENTITY FULL lets the publication log the old row.
-- ------------------------------------------------------------
alter table stock_levels replica identity full;
