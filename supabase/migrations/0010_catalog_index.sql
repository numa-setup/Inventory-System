-- ------------------------------------------------------------
-- Round 3 / Section 1 — catalogue index view
-- ------------------------------------------------------------
-- One flat, searchable row per variant with everything the POS / scanner /
-- pickers need: name, composed option label, primary barcode, price, live
-- stock, category, variable-weight flag. This replaces the 5 full-table
-- queries that lib/catalog.ts assembled in JS on every POS/purchasing load,
-- and is the single source the client caches locally (in-memory + IndexedDB)
-- so scans and search resolve instantly and survive brief network drops.
--
-- Mirrors the existing variant_availability view convention (no
-- security_invoker) — it is read through the user's server client.

create or replace view catalog_index as
  select
    pv.id                                           as variant_id,
    pv.product_id,
    p.name                                          as product_name,
    p.brand,
    p.has_variants,
    p.is_variable_weight,
    pv.sku,
    coalesce(
      (select string_agg(pov.value, ' / ' order by po.sort, pov.sort)
         from variant_option_values vov
         join product_option_values pov on pov.id = vov.option_value_id
         join product_options po        on po.id  = pov.option_id
        where vov.variant_id = pv.id),
      case when pv.is_default then 'Default' else pv.sku end
    )                                               as label,
    (select b.barcode
       from product_barcodes b
      where b.variant_id = pv.id
      order by b.is_primary desc nulls last
      limit 1)                                      as barcode,
    pv.sale_price::numeric(14,2)                    as price,
    pv.cost::numeric(14,4)                          as cost,
    p.category_id,
    p.image_url,
    coalesce(va.available, 0)::numeric(14,3)        as available,
    coalesce(va.avg_cost, 0)::numeric(14,4)         as avg_cost,
    (pv.active and p.active)                        as active,
    greatest(pv.updated_at, p.updated_at)           as updated_at
  from product_variants pv
  join products p on p.id = pv.product_id
  left join variant_availability va on va.variant_id = pv.id;
