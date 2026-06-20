-- ------------------------------------------------------------
-- Upgrade / Part 2 + 3 — per-product default discount & low-stock surfacing
-- ------------------------------------------------------------
-- Part 2: each variant can carry a standard/default discount (its intended
-- lowest selling price). The POS auto-fills this as an editable per-line
-- discount. Stored on the variant so non-variant products (one default
-- variant) and variant products both work uniformly.
--
-- Part 3: the per-variant low-stock threshold already exists
-- (product_variants.reorder_point); here we simply expose it (and the new
-- discount) through catalog_index so the POS / scanner cache carry them.

alter table product_variants
  add column if not exists default_discount_type  discount_type,
  add column if not exists default_discount_value numeric(14,2) not null default 0;

comment on column product_variants.default_discount_type  is 'PERCENT or FIXED — the product''s standard discount applied automatically in POS (null = none).';
comment on column product_variants.default_discount_value is 'Discount amount: percent (0-100) when type=PERCENT, rupees off when type=FIXED.';

-- Recreate the catalogue index with the discount + reorder columns so the
-- client cache (POS / scanner) has everything it needs without extra queries.
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
    greatest(pv.updated_at, p.updated_at)           as updated_at,
    -- appended (0023): default discount + low-stock threshold for the cache
    pv.default_discount_type                        as disc_type,
    pv.default_discount_value::numeric(14,2)        as disc_value,
    pv.reorder_point::numeric(14,3)                 as reorder_point
  from product_variants pv
  join products p on p.id = pv.product_id
  left join variant_availability va on va.variant_id = pv.id;

-- Extend the one-round-trip product creator to persist the default discount
-- on each variant (everything else unchanged).
create or replace function create_product_full(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
  v_sup uuid; v_main uuid;
  v_opt jsonb; v_val text; v_variant jsonb;
  v_option_id uuid; v_value_id uuid; v_variant_id uuid;
  v_oi int; v_vi int;
  v_value_map jsonb := '{}'::jsonb;   -- "oi::value" -> value_id
  v_has_variants boolean := coalesce((payload->>'has_variants')::boolean, false);
begin
  insert into products(name, sku, brand, category_id, description, base_unit,
                       default_sale_price, reorder_point, has_variants)
  values (
    payload->>'name',
    payload->'variants'->0->>'sku',
    nullif(payload->>'brand', ''),
    nullif(payload->>'category_id', '')::uuid,
    nullif(payload->>'description', ''),
    coalesce(nullif(payload->>'base_unit',''), 'pcs'),
    (payload->>'base_price')::numeric,
    coalesce((payload->'variants'->0->>'reorder_point')::numeric, 0),
    v_has_variants
  )
  returning id into v_product_id;

  insert into store_listings(product_id, online_price, title, slug)
  values (v_product_id, (payload->>'base_price')::numeric, payload->>'name', payload->>'slug');

  -- options + values
  v_oi := 0;
  for v_opt in select * from jsonb_array_elements(coalesce(payload->'options', '[]'::jsonb)) loop
    insert into product_options(product_id, name, sort)
    values (v_product_id, v_opt->>'name', v_oi + 1)
    returning id into v_option_id;

    v_vi := 0;
    for v_val in select jsonb_array_elements_text(v_opt->'values') loop
      insert into product_option_values(option_id, value, sort)
      values (v_option_id, v_val, v_vi + 1)
      returning id into v_value_id;
      v_value_map := jsonb_set(v_value_map, array[v_oi || '::' || v_val], to_jsonb(v_value_id::text));
      v_vi := v_vi + 1;
    end loop;
    v_oi := v_oi + 1;
  end loop;

  select id into v_sup from locations where code = 'SUP' limit 1;
  select id into v_main from locations where code = 'MAIN' limit 1;

  -- variants + barcodes + option links + opening stock
  v_oi := 0;
  for v_variant in select * from jsonb_array_elements(payload->'variants') loop
    insert into product_variants(product_id, sku, cost, sale_price, reorder_point,
                                 default_discount_type, default_discount_value, is_default)
    values (
      v_product_id, v_variant->>'sku',
      coalesce((v_variant->>'cost')::numeric, 0),
      coalesce((v_variant->>'sale_price')::numeric, 0),
      coalesce((v_variant->>'reorder_point')::numeric, 0),
      nullif(v_variant->>'default_discount_type', '')::discount_type,
      coalesce((v_variant->>'default_discount_value')::numeric, 0),
      v_oi = 0
    )
    returning id into v_variant_id;

    if coalesce(v_variant->>'barcode', '') <> '' then
      insert into product_barcodes(product_id, variant_id, barcode, type, is_primary)
      values (v_product_id, v_variant_id, v_variant->>'barcode',
              (case when v_has_variants then 'INTERNAL' else 'EAN' end)::barcode_type, true);
    end if;

    v_vi := 0;
    for v_val in select jsonb_array_elements_text(coalesce(v_variant->'option_values', '[]'::jsonb)) loop
      v_value_id := nullif(v_value_map->>(v_vi || '::' || v_val), '')::uuid;
      if v_value_id is not null then
        insert into variant_option_values(variant_id, option_value_id) values (v_variant_id, v_value_id);
      end if;
      v_vi := v_vi + 1;
    end loop;

    if coalesce((v_variant->>'opening_qty')::numeric, 0) > 0 and v_sup is not null and v_main is not null then
      insert into stock_moves(product_id, variant_id, qty, from_location_id, to_location_id,
                              unit_cost, reference_type, source, created_by, note)
      values (v_product_id, v_variant_id, (v_variant->>'opening_qty')::numeric, v_sup, v_main,
              coalesce((v_variant->>'cost')::numeric, 0), 'OPENING', 'MANUAL',
              nullif(payload->>'created_by','')::uuid, 'Opening stock on product creation');
    end if;

    v_oi := v_oi + 1;
  end loop;

  return v_product_id;
end;
$$;

revoke execute on function create_product_full(jsonb) from public;
grant execute on function create_product_full(jsonb) to service_role;
