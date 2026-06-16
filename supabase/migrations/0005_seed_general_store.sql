-- ============================================================
-- 0005 — General-store categories + realistic variant products
-- Cosmetics / Jewellery / Gift Packs / Toys / Accessories / Stationery.
-- Idempotent: each product is skipped if its parent SKU already exists.
-- ============================================================

-- ------------------------------------------------------------
-- Categories (parents + sub-categories)
-- ------------------------------------------------------------
create or replace function seed_cat(_name text, _parent text) returns uuid as $$
declare pid uuid; cid uuid;
begin
  if _parent is not null then
    select id into pid from categories where name = _parent and parent_id is null limit 1;
    if pid is null then
      insert into categories(name, parent_id, sort) values (_parent, null, 0) returning id into pid;
    end if;
  end if;
  select id into cid from categories
    where name = _name and (parent_id is not distinct from pid) limit 1;
  if cid is null then
    insert into categories(name, parent_id, sort) values (_name, pid, 0) returning id into cid;
  end if;
  return cid;
end;
$$ language plpgsql;

do $$
begin
  perform seed_cat('Cosmetics', null);
  perform seed_cat('Makeup',    'Cosmetics');
  perform seed_cat('Skincare',  'Cosmetics');
  perform seed_cat('Fragrance', 'Cosmetics');
  perform seed_cat('Haircare',  'Cosmetics');

  perform seed_cat('Jewellery', null);
  perform seed_cat('Rings',     'Jewellery');
  perform seed_cat('Necklaces', 'Jewellery');
  perform seed_cat('Earrings',  'Jewellery');
  perform seed_cat('Bangles',   'Jewellery');
  perform seed_cat('Bracelets', 'Jewellery');

  perform seed_cat('Gift Packs', null);

  perform seed_cat('Toys',           null);
  perform seed_cat('Educational',    'Toys');
  perform seed_cat('Action Figures', 'Toys');
  perform seed_cat('Soft Toys',      'Toys');

  perform seed_cat('Accessories',     null);
  perform seed_cat('Bags',            'Accessories');
  perform seed_cat('Watches',         'Accessories');
  perform seed_cat('Hair Accessories','Accessories');

  perform seed_cat('Stationery',    null);
  perform seed_cat('Personal Care', null);
end $$;

-- ------------------------------------------------------------
-- Reusable variant-product seeder (supports 0, 1 or 2 options)
-- ------------------------------------------------------------
create or replace function seed_vp(
  _sku text, _name text, _brand text, _cat text,
  _o1 text, _o1vals text[], _o2 text, _o2vals text[],
  _price numeric, _cost numeric, _qty numeric, _barbase text
) returns void as $$
declare
  pid uuid; cat_id uuid; opt1 uuid; opt2 uuid;
  sup uuid; main uuid;
  r1 record; r2 record;
  vid uuid; idx int := 0; val text; s int;
begin
  if exists (select 1 from products where sku = _sku) then return; end if;

  select id into cat_id from categories where name = _cat order by (parent_id is not null) desc limit 1;
  select id into sup  from locations where code = 'SUP';
  select id into main from locations where code = 'MAIN';

  insert into products (sku, name, brand, category_id, base_unit, reorder_point, default_sale_price, has_variants, active)
  values (_sku, _name, _brand, cat_id, 'pcs', 3, _price, _o1 is not null, true)
  returning id into pid;

  insert into store_listings (product_id, online_price, title, slug)
  values (pid, _price, _name,
          lower(regexp_replace(_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || left(_sku, 10))
  on conflict (product_id) do nothing;

  -- options + values
  if _o1 is not null then
    insert into product_options(product_id, name, sort) values (pid, _o1, 1) returning id into opt1;
    s := 0;
    foreach val in array _o1vals loop
      s := s + 1;
      insert into product_option_values(option_id, value, sort) values (opt1, val, s);
    end loop;
  end if;
  if _o2 is not null then
    insert into product_options(product_id, name, sort) values (pid, _o2, 2) returning id into opt2;
    s := 0;
    foreach val in array _o2vals loop
      s := s + 1;
      insert into product_option_values(option_id, value, sort) values (opt2, val, s);
    end loop;
  end if;

  -- variant generation (cartesian product)
  if _o1 is null then
    -- no options -> single default variant
    insert into product_variants(product_id, sku, cost, sale_price, reorder_point, is_default)
    values (pid, _sku, _cost, _price, 3, true) returning id into vid;
    insert into product_barcodes(product_id, variant_id, barcode, type, is_primary)
    values (pid, vid, _barbase, 'EAN', true);
    insert into stock_moves(product_id, variant_id, qty, from_location_id, to_location_id, unit_cost, reference_type, source, note)
    values (pid, vid, _qty, sup, main, _cost, 'OPENING', 'IMPORT', 'Opening stock (seed)');
  else
    for r1 in select id, value from product_option_values where option_id = opt1 order by sort loop
      if opt2 is not null then
        for r2 in select id, value from product_option_values where option_id = opt2 order by sort loop
          idx := idx + 1;
          insert into product_variants(product_id, sku, cost, sale_price, reorder_point, is_default)
          values (pid, _sku || '-' || idx, _cost, _price, 3, idx = 1) returning id into vid;
          insert into variant_option_values(variant_id, option_value_id) values (vid, r1.id), (vid, r2.id);
          insert into product_barcodes(product_id, variant_id, barcode, type, is_primary)
          values (pid, vid, _barbase || idx::text, 'INTERNAL', idx = 1);
          insert into stock_moves(product_id, variant_id, qty, from_location_id, to_location_id, unit_cost, reference_type, source, note)
          values (pid, vid, _qty, sup, main, _cost, 'OPENING', 'IMPORT', 'Opening stock (seed)');
        end loop;
      else
        idx := idx + 1;
        insert into product_variants(product_id, sku, cost, sale_price, reorder_point, is_default)
        values (pid, _sku || '-' || idx, _cost, _price, 3, idx = 1) returning id into vid;
        insert into variant_option_values(variant_id, option_value_id) values (vid, r1.id);
        insert into product_barcodes(product_id, variant_id, barcode, type, is_primary)
        values (pid, vid, _barbase || idx::text, 'INTERNAL', idx = 1);
        insert into stock_moves(product_id, variant_id, qty, from_location_id, to_location_id, unit_cost, reference_type, source, note)
        values (pid, vid, _qty, sup, main, _cost, 'OPENING', 'IMPORT', 'Opening stock (seed)');
      end if;
    end loop;
  end if;
end;
$$ language plpgsql;

-- ------------------------------------------------------------
-- Seed the example products
-- ------------------------------------------------------------
do $$
begin
  -- Lipstick: Shade x Size (6 variants)
  perform seed_vp('COS-LIP-01', 'Maybelline SuperStay Lipstick', 'Maybelline', 'Makeup',
    'Shade', array['Ruby Red','Nude Pink','Coral'], 'Size', array['3.5g','5g'],
    1450, 820, 12, '8901000010');

  -- Perfume: Size x Scent (4 variants)
  perform seed_vp('COS-PRF-01', 'J. Janan Eau de Parfum', 'J.', 'Fragrance',
    'Size', array['50ml','100ml'], 'Scent', array['Oud','Rose'],
    3200, 1900, 8, '8901000020');

  -- Lip balm: Flavor only (3 variants)
  perform seed_vp('COS-BLM-01', 'Vaseline Lip Therapy', 'Vaseline', 'Skincare',
    'Flavor', array['Cherry','Aloe','Original'], null, null,
    350, 180, 20, '8901000030');

  -- Ring: Ring size only (4 variants)
  perform seed_vp('JWL-RNG-01', 'Silver Solitaire Ring', 'Argento', 'Rings',
    'Ring Size', array['6','7','8','9'], null, null,
    2500, 1400, 6, '8901000040');

  -- Toy: Size x Color (4 variants)
  perform seed_vp('TOY-BLK-01', 'Stacking Building Blocks', 'PlayCo', 'Educational',
    'Size', array['Small','Large'], 'Color', array['Red','Blue'],
    900, 480, 10, '8901000050');

  -- Gift pack: no variants -> default variant
  perform seed_vp('GFT-BOX-01', 'Eid Deluxe Gift Box', null, 'Gift Packs',
    null, null, null, null,
    1800, 1100, 15, '8901000060');
end $$;

-- cleanup helpers
drop function seed_vp(text, text, text, text, text, text[], text, text[], numeric, numeric, numeric, text);
drop function seed_cat(text, text);
