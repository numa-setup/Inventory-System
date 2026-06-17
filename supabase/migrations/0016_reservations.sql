-- ------------------------------------------------------------
-- Round 1 / Prompt 2 — storefront checkout: stock-holding reservations
-- ------------------------------------------------------------
-- A web order HOLDS stock so it can't be oversold (by the POS or another order).
-- Reservations were never reflected in stock_levels.reserved, so available
-- (on_hand - reserved) never moved. This trigger maintains reserved at MAIN as
-- HELD reservations are created, released/committed, re-sized, or deleted.

create or replace function apply_reservation() returns trigger as $$
declare main_loc uuid;
begin
  select id into main_loc from locations where code = 'MAIN' limit 1;
  if main_loc is null then return coalesce(new, old); end if;

  if tg_op = 'INSERT' then
    if new.status = 'HELD' and new.variant_id is not null then
      insert into stock_levels(product_id, variant_id, location_id, lot_id, on_hand, reserved, avg_cost)
      values (new.product_id, new.variant_id, main_loc, null, 0, new.qty, 0)
      on conflict (variant_id, location_id, lot_id) do update
        set reserved = stock_levels.reserved + new.qty, updated_at = now();
    end if;
    return new;

  elsif tg_op = 'UPDATE' then
    -- hold released or committed to a sale -> drop the reservation
    if old.status = 'HELD' and new.status <> 'HELD' then
      update stock_levels set reserved = greatest(reserved - old.qty, 0), updated_at = now()
        where variant_id = old.variant_id and location_id = main_loc and lot_id is null;
    -- still held but quantity changed
    elsif old.status = 'HELD' and new.status = 'HELD' and new.qty <> old.qty then
      update stock_levels set reserved = greatest(reserved - old.qty + new.qty, 0), updated_at = now()
        where variant_id = new.variant_id and location_id = main_loc and lot_id is null;
    end if;
    return new;

  elsif tg_op = 'DELETE' then
    if old.status = 'HELD' then
      update stock_levels set reserved = greatest(reserved - old.qty, 0), updated_at = now()
        where variant_id = old.variant_id and location_id = main_loc and lot_id is null;
    end if;
    return old;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists trg_apply_reservation on reservations;
create trigger trg_apply_reservation after insert or update or delete on reservations
  for each row execute function apply_reservation();

-- Sequential web order numbers (W-01001, …) handed out to the service client.
create sequence if not exists web_order_seq start 1001 increment 1;
create or replace function next_web_order() returns bigint
  language sql as $$ select nextval('web_order_seq'); $$;
