-- ------------------------------------------------------------
-- Round 6 / Part 1 — collapse "add product" into ONE round-trip
-- ------------------------------------------------------------
-- Previously: insert product, listing, each option, each value, each variant,
-- each barcode, each option link, each opening stock move = up to ~35 sequential
-- network calls (~2.6s at ~76ms RTT). This function does it all in ONE
-- transaction / one round-trip. Triggers (apply_stock_move) still fire normally.

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
    insert into product_variants(product_id, sku, cost, sale_price, reorder_point, is_default)
    values (
      v_product_id, v_variant->>'sku',
      coalesce((v_variant->>'cost')::numeric, 0),
      coalesce((v_variant->>'sale_price')::numeric, 0),
      coalesce((v_variant->>'reorder_point')::numeric, 0),
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
