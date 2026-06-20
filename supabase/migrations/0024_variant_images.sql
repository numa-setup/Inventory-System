-- ------------------------------------------------------------
-- Upgrade — optional per-variant product image
-- ------------------------------------------------------------
-- Each variant may carry its own photo (e.g. a lipstick shade, a perfume size).
-- It is OPTIONAL: when a variant has no image we fall back to the parent
-- product image. Uploads go to the existing public 'product-images' bucket via
-- the service-role server action (same mechanism as product photos).

alter table product_variants
  add column if not exists image_url text;

comment on column product_variants.image_url is 'Optional per-variant photo. When null, the parent product image_url is used.';

-- Recreate the catalogue index so its image_url is the EFFECTIVE image for the
-- variant: the variant photo when set, otherwise the parent product photo. POS
-- and the scanner cache then show the right picture per variant automatically.
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
    pv.reorder_point::numeric(14,3)                 as reorder_point
  from product_variants pv
  join products p on p.id = pv.product_id
  left join variant_availability va on va.variant_id = pv.id;
