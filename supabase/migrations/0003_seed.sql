-- ============================================================
-- Seed data — safe to run once on a fresh database.
-- The owner auth user is created separately via the admin API
-- (scripts/setup-owner.mjs), which fires handle_new_user().
-- ============================================================

-- Settings singleton
insert into settings (id, store_name) values (1, 'Hamza General Store')
on conflict (id) do nothing;

-- Locations (physical + virtual ledger endpoints)
insert into locations (code, name, type) values
  ('MAIN',  'Main Store',     'PHYSICAL'),
  ('SUP',   'Suppliers',      'SUPPLIER'),
  ('CUST',  'Customers',      'CUSTOMER'),
  ('LOSS',  'Loss / Damage',  'LOSS'),
  ('ADJ',   'Adjustments',    'ADJUSTMENT'),
  ('TRANS', 'In Transit',     'TRANSIT')
on conflict (code) do nothing;

-- Categories
insert into categories (name, sort) values
  ('Grocery', 1), ('Beverages', 2), ('Snacks', 3),
  ('Household', 4), ('Personal Care', 5)
on conflict do nothing;

-- Products
insert into products (sku, name, category_id, base_unit, reorder_point, safety_stock, default_sale_price)
select v.sku, v.name, c.id, v.unit, v.reorder, v.safety, v.price
from (values
  ('SKU-1001','Sufi Cooking Oil 5L','Grocery','pcs',10,4,2650),
  ('SKU-1002','Basmati Rice 5kg','Grocery','pcs',8,3,1850),
  ('SKU-1003','Sugar 1kg','Grocery','pcs',20,8,165),
  ('SKU-1004','Coca-Cola 1.5L','Beverages','pcs',24,12,160),
  ('SKU-1005','Lays Masala 60g','Snacks','pcs',30,10,100),
  ('SKU-1006','Surf Excel 1kg','Household','pcs',12,5,520),
  ('SKU-1007','Lifebuoy Soap','Personal Care','pcs',24,10,120),
  ('SKU-1008','Tapal Danedar 950g','Beverages','pcs',6,2,1390)
) as v(sku,name,cat,unit,reorder,safety,price)
join categories c on c.name = v.cat
on conflict (sku) do nothing;

-- Primary barcodes
insert into product_barcodes (product_id, barcode, type, is_primary)
select p.id, b.barcode, 'EAN', true
from (values
  ('SKU-1001','8964000201015'),
  ('SKU-1002','8964000201022'),
  ('SKU-1003','8964000201039'),
  ('SKU-1004','5449000000996'),
  ('SKU-1005','8964000201053'),
  ('SKU-1006','8964000201060'),
  ('SKU-1007','8964000201077'),
  ('SKU-1008','8964000201084')
) as b(sku,barcode)
join products p on p.sku = b.sku
on conflict (barcode) do nothing;

-- Auto-create hidden store listings for every product
insert into store_listings (product_id, online_price, title, slug)
select p.id, p.default_sale_price, p.name,
       lower(regexp_replace(p.name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || left(p.sku, 8)
from products p
on conflict (product_id) do nothing;

-- Suppliers & customers
insert into suppliers (name, phone, address) values
  ('Karachi Wholesale Mart', '0300-1234567', 'Jodia Bazaar, Karachi'),
  ('Lahore Distributors',     '0321-7654321', 'Akbari Mandi, Lahore')
on conflict do nothing;

insert into customers (name, phone, credit_limit) values
  ('Walk-in Customer', NULL, 0),
  ('Bilal Traders', '0301-1112222', 50000),
  ('Ayesha Khan', '0345-3334444', 10000)
on conflict do nothing;

-- Opening stock: receive each product into MAIN from SUPPLIER at a cost
insert into stock_moves (product_id, qty, from_location_id, to_location_id, unit_cost, reference_type, source, note)
select p.id, s.qty,
       (select id from locations where code = 'SUP'),
       (select id from locations where code = 'MAIN'),
       s.cost, 'OPENING', 'IMPORT', 'Opening balance'
from (values
  ('SKU-1001', 40, 2300),
  ('SKU-1002', 30, 1600),
  ('SKU-1003', 80, 140),
  ('SKU-1004', 96, 130),
  ('SKU-1005', 120, 78),
  ('SKU-1006', 36, 430),
  ('SKU-1007', 90, 92),
  ('SKU-1008', 18, 1180)
) as s(sku, qty, cost)
join products p on p.sku = s.sku
-- only seed opening stock once (skip if any move already exists for the product)
where not exists (
  select 1 from stock_moves m where m.product_id = p.id and m.reference_type = 'OPENING'
);
