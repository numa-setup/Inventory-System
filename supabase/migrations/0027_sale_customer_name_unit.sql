-- ------------------------------------------------------------
-- Upgrade — POS customer NAME on the sale + base unit in the catalogue
-- ------------------------------------------------------------
-- Part 3: the till now captures a free-typed customer NAME (defaults to
-- "Walk-in customer"). It may or may not be linked to a saved customer row, so
-- we persist the name directly on the sale and use it on the invoice / history.
alter table sales
  add column if not exists customer_name text;

comment on column sales.customer_name is
  'Customer name captured at the till (Part 3). May be a free walk-in name even when customer_id is null.';

-- Part 2: the invoice Qty column shows the product unit (e.g. Pcs). Expose the
-- product base_unit through the catalogue index so the POS / scanner cache (and
-- therefore the receipt builder) carry it. Appended at END — create-or-replace
-- forbids reordering existing columns.
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
    coalesce(pv.image_url, p.image_url)             as image_url,
    coalesce(va.available, 0)::numeric(14,3)        as available,
    coalesce(va.avg_cost, 0)::numeric(14,4)         as avg_cost,
    (pv.active and p.active)                        as active,
    greatest(pv.updated_at, p.updated_at)           as updated_at,
    pv.default_discount_type                        as disc_type,
    pv.default_discount_value::numeric(14,2)        as disc_value,
    pv.reorder_point::numeric(14,3)                 as reorder_point,
    -- appended (0027): product base unit for the invoice Qty column
    coalesce(nullif(p.base_unit, ''), 'Pcs')        as unit
  from product_variants pv
  join products p on p.id = pv.product_id
  left join variant_availability va on va.variant_id = pv.id;
