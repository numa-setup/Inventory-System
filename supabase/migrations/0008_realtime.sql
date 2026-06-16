-- ============================================================
-- 0008 — Enable Realtime on the tables the dashboard watches so
-- KPIs/charts refresh live as sales, stock and orders change.
-- Idempotent: only adds a table if it isn't already published.
-- ============================================================
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['sales','orders','stock_moves','stock_levels'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;
