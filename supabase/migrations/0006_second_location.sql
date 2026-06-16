-- ============================================================
-- 0006 — Add a second physical location so transfers + the
-- location filter in the Stock area are meaningful.
-- ============================================================
insert into locations (code, name, type) values
  ('WH', 'Warehouse', 'PHYSICAL')
on conflict (code) do nothing;
