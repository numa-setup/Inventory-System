-- ------------------------------------------------------------
-- Round 3 / Section 4 — stock safety: block negative / oversold stock
-- ------------------------------------------------------------
-- The append-only ledger already keeps stock_levels atomically (the AFTER-INSERT
-- trigger upsert is a single statement, and stock_moves.idempotency_key is
-- UNIQUE so retries can't double-post). What was missing is a hard stop on
-- driving a PHYSICAL location's on-hand below zero — i.e. overselling. We add
-- that guard inside the same trigger so it runs in the move's transaction and
-- rolls the whole sale/move back if it would oversell. Virtual locations
-- (SUPPLIER/CUSTOMER/ADJUSTMENT/LOSS/TRANSIT) are intentionally unguarded.

create or replace function apply_stock_move() returns trigger as $$
begin
  -- Outgoing leg
  if new.from_location_id is not null then
    insert into stock_levels(product_id, variant_id, location_id, lot_id, on_hand, reserved, avg_cost)
    values (new.product_id, new.variant_id, new.from_location_id, new.lot_id, -new.qty, 0, 0)
    on conflict (variant_id, location_id, lot_id) do update
      set on_hand = stock_levels.on_hand - new.qty,
          updated_at = now();

    -- Guard: a physical location must never go negative (no overselling).
    if exists (
      select 1
        from stock_levels sl
        join locations l on l.id = sl.location_id
       where sl.variant_id = new.variant_id
         and sl.location_id = new.from_location_id
         and sl.lot_id is not distinct from new.lot_id
         and l.type = 'PHYSICAL'
         and sl.on_hand < 0
    ) then
      raise exception 'Insufficient stock: not enough on hand to remove % unit(s) of variant %', new.qty, new.variant_id
        using errcode = 'check_violation';
    end if;
  end if;

  -- Incoming leg + moving average
  if new.to_location_id is not null then
    insert into stock_levels(product_id, variant_id, location_id, lot_id, on_hand, reserved, avg_cost)
    values (new.product_id, new.variant_id, new.to_location_id, new.lot_id, new.qty, 0, coalesce(new.unit_cost,0))
    on conflict (variant_id, location_id, lot_id) do update
      set on_hand = stock_levels.on_hand + new.qty,
          avg_cost = case
            when new.unit_cost is not null and (stock_levels.on_hand + new.qty) > 0
              then ((greatest(stock_levels.on_hand,0) * stock_levels.avg_cost)
                    + (new.qty * new.unit_cost))
                   / (greatest(stock_levels.on_hand,0) + new.qty)
            else stock_levels.avg_cost
          end,
          updated_at = now();
  end if;
  return new;
end;
$$ language plpgsql;
