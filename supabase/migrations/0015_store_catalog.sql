-- ------------------------------------------------------------
-- Round 1 / Prompt 2 — customer storefront: published catalogue
-- ------------------------------------------------------------
-- One row per published, active product with everything the public storefront
-- renders: display title, slug, online price (override or default), images,
-- category, live availability and SEO fields. Read server-side by the
-- storefront (only published/public data is exposed).

-- Make sure every active product has a listing, then publish them so the store
-- isn't empty on first run (the owner can unpublish from the admin Storefront).
insert into store_listings (product_id, is_published, online_price, title, slug)
select
  p.id, true, p.default_sale_price, p.name,
  trim(both '-' from lower(regexp_replace(p.name, '[^a-zA-Z0-9]+', '-', 'g'))) || '-' || substr(p.id::text, 1, 6)
from products p
where p.active = true
  and not exists (select 1 from store_listings sl where sl.product_id = p.id)
on conflict (product_id) do nothing;

update store_listings sl
set is_published = true,
    online_price = coalesce(sl.online_price, (select default_sale_price from products p where p.id = sl.product_id))
where exists (select 1 from products p where p.id = sl.product_id and p.active = true);

create or replace view store_catalog as
  select
    sl.product_id,
    sl.slug,
    coalesce(nullif(sl.title, ''), p.name)                       as title,
    coalesce(sl.description, p.description)                      as description,
    coalesce(sl.online_price, p.default_sale_price)::numeric(14,2) as price,
    sl.images,
    p.image_url,
    p.category_id,
    c.name                                                       as category_name,
    c.parent_id                                                  as category_parent_id,
    p.brand,
    p.base_unit,
    p.has_variants,
    p.is_variable_weight,
    coalesce(pa.available, 0)::numeric(14,3)                     as available,
    sl.sort,
    coalesce(nullif(sl.seo_title, ''), p.name)                   as seo_title,
    coalesce(sl.seo_description, p.description)                  as seo_description,
    sl.created_at
  from store_listings sl
  join products p on p.id = sl.product_id
  left join categories c on c.id = p.category_id
  left join product_availability pa on pa.product_id = sl.product_id
  where sl.is_published = true and p.active = true;
