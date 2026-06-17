-- ------------------------------------------------------------
-- Reservation expiry: free stock held by abandoned web orders.
-- ------------------------------------------------------------
-- A web order holds stock (HELD reservations) for 48h. If it's never confirmed,
-- this maintenance function cancels the order and releases its holds (the
-- reservation trigger then restores stock_levels.reserved). Orders staff have
-- already CONFIRMED/PACKED are left alone. SECURITY DEFINER so it can run from a
-- staff session, the API cron route, or pg_cron.

create or replace function release_expired_reservations() returns integer
  language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  -- Auto-cancel abandoned orders (still PLACED, never confirmed) past hold expiry.
  update orders o set status = 'CANCELLED'
   where o.status = 'PLACED'
     and exists (
       select 1 from reservations r
        where r.order_id = o.id and r.status = 'HELD' and r.expires_at < now()
     );

  -- Release holds for any cancelled order (incl. the ones just cancelled) and
  -- any order-less HELD reservation past expiry.
  with released as (
    update reservations r set status = 'RELEASED'
     where r.status = 'HELD'
       and ( exists (select 1 from orders o where o.id = r.order_id and o.status = 'CANCELLED')
             or (r.order_id is null and r.expires_at < now()) )
    returning 1
  )
  select count(*) into n from released;
  return n;
end;
$$;

-- Best-effort background schedule via pg_cron (if available on this project).
-- Harmless if the extension can't be enabled — the API route + the opportunistic
-- call on the Orders page cover it.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    null;
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $cron$
      select cron.schedule('release-expired-reservations', '*/15 * * * *',
                           'select public.release_expired_reservations();')
       where not exists (select 1 from cron.job where jobname = 'release-expired-reservations')
    $cron$;
  end if;
end $$;
