// DEV reset + realistic reseed for Hamza General Store.
// Wipes seeded catalogue/transactions (KEEPS schema, users/roles, settings),
// then seeds a coherent general-store dataset: categories + sub-categories,
// ~50 products (several with variants) each with a placeholder image + opening
// stock, suppliers + purchases, customers (some on udhaar), POS sales, web
// orders and a few promotions — so dashboard / stock / reports / storefront all
// look populated.
//
//   node scripts/reseed.mjs
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { connect } from "./db.mjs";

dotenv.config({ path: ".env.local" });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const BUCKET = "product-images";
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
let barcodeSeq = 2_300_000_000_001;
const nextBarcode = () => String(barcodeSeq++);
const rand = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

// ---- category palette (parent -> gradient) -------------------------------
const COLORS = {
  Cosmetics: ["#d98ca6", "#a8466b"], Jewellery: ["#cda94f", "#937024"], Grocery: ["#8aa66a", "#566f3c"],
  Beverages: ["#6aa7c9", "#356f96"], Snacks: ["#d99a5b", "#a5631f"], "Personal Care": ["#7fbfb0", "#43897a"],
  Household: ["#9b8ec9", "#62509c"], Toys: ["#d96a6a", "#a53434"], "Gift Packs": ["#c97fb0", "#9a4f81"],
  Stationery: ["#6a78c9", "#374aa0"],
};
function svgFor(name, brand, [a, b]) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750" viewBox="0 0 600 750">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="600" height="750" fill="url(#g)"/>
<rect x="38" y="38" width="524" height="674" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1.5"/>
${brand ? `<text x="300" y="330" text-anchor="middle" font-family="Georgia,serif" font-size="21" letter-spacing="5" fill="rgba(255,255,255,0.9)">${esc(brand.toUpperCase())}</text>` : ""}
<text x="300" y="392" text-anchor="middle" font-family="Georgia,serif" font-size="38" fill="#ffffff">${esc(name.length > 22 ? name.slice(0, 21) + "…" : name)}</text>
<text x="300" y="690" text-anchor="middle" font-family="Georgia,serif" font-size="14" letter-spacing="3" fill="rgba(255,255,255,0.75)">HAMZA GENERAL STORE</text>
</svg>`;
}
async function uploadImage(productId, name, brand, parentCat) {
  const svg = svgFor(name, brand, COLORS[parentCat] ?? COLORS.Household);
  const path = `${productId}/cover.svg`;
  const { error } = await db.storage.from(BUCKET).upload(path, Buffer.from(svg), { contentType: "image/svg+xml", upsert: true, cacheControl: "31536000" });
  if (error) { console.warn("  image upload failed:", error.message); return null; }
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// ---- categories ----------------------------------------------------------
const CATS = {
  Cosmetics: ["Makeup", "Skincare", "Fragrance", "Haircare"],
  Jewellery: ["Rings", "Earrings", "Necklaces", "Bangles"],
  Grocery: ["Rice", "Flour", "Oil", "Tea", "Sugar", "Spices"],
  Beverages: [], Snacks: [], "Personal Care": [], Household: [], Toys: [], "Gift Packs": [], Stationery: [],
};

// ---- products ------------------------------------------------------------
// p(name, cat, brand, unit, cost, price, reorder, opening, variants?)
// variants: { option, values: [{ v, cost?, price? }] }
const P = (name, cat, brand, unit, cost, price, reorder, opening, variants = null) =>
  ({ name, cat, brand, unit, cost, price, reorder, opening, variants });

const PRODUCTS = [
  // Cosmetics · Makeup
  P("Rivaj Matte Lipstick", "Makeup", "Rivaj UK", "pcs", 240, 450, 8, 60, { option: "Shade", values: [{ v: "Ruby Red" }, { v: "Coral Crush" }, { v: "Nude Beige" }, { v: "Plum Wine" }] }),
  P("Medora Nail Polish", "Makeup", "Medora", "pcs", 70, 150, 12, 90, { option: "Shade", values: [{ v: "Classic Red" }, { v: "Soft Pink" }, { v: "Midnight Blue" }] }),
  P("Maybelline Fit Me Foundation", "Makeup", "Maybelline", "pcs", 1450, 2299, 5, 24),
  P("Sweet Touch Kajal", "Makeup", "Sweet Touch", "pcs", 110, 220, 10, 70),
  // Cosmetics · Skincare
  P("Ponds White Beauty Cream", "Skincare", "Pond's", "pcs", 320, 520, 8, 48),
  P("Garnier Face Wash", "Skincare", "Garnier", "pcs", 280, 460, 8, 40),
  P("Vaseline Lotion 200ml", "Skincare", "Vaseline", "pcs", 360, 590, 6, 36, { option: "Size", values: [{ v: "100ml", cost: 220, price: 360 }, { v: "200ml", cost: 360, price: 590 }, { v: "400ml", cost: 620, price: 980 }] }),
  // Cosmetics · Fragrance
  P("Janan Perfume", "Fragrance", "J.", "pcs", 1600, 2600, 4, 20, { option: "Size", values: [{ v: "50ml", cost: 1600, price: 2600 }, { v: "100ml", cost: 2600, price: 4200 }] }),
  P("Bonanza Body Spray", "Fragrance", "Bonanza", "pcs", 380, 650, 8, 44, { option: "Scent", values: [{ v: "Oud" }, { v: "Citrus" }, { v: "Musk" }] }),
  // Cosmetics · Haircare
  P("Sunsilk Shampoo 360ml", "Haircare", "Sunsilk", "pcs", 360, 560, 8, 50),
  P("Dabur Amla Hair Oil", "Haircare", "Dabur", "pcs", 220, 360, 10, 60),
  // Jewellery
  P("Gold-Plated Ring", "Rings", "Hamza Jewels", "pcs", 350, 850, 6, 30, { option: "Size", values: [{ v: "Small" }, { v: "Medium" }, { v: "Large" }] }),
  P("Pearl Drop Earrings", "Earrings", "Hamza Jewels", "pair", 420, 1100, 5, 26),
  P("Kundan Necklace Set", "Necklaces", "Hamza Jewels", "set", 1800, 3900, 3, 12),
  P("Glass Bangles (Dozen)", "Bangles", "Hamza Jewels", "dozen", 180, 420, 8, 40, { option: "Colour", values: [{ v: "Red" }, { v: "Green" }, { v: "Gold" }] }),
  // Grocery · Rice
  P("Guard Basmati Rice 5kg", "Rice", "Guard", "bag", 1850, 2350, 6, 40),
  P("Falak Sella Rice 5kg", "Rice", "Falak", "bag", 1600, 2050, 6, 35),
  // Grocery · Flour
  P("Sunridge Atta 10kg", "Flour", "Sunridge", "bag", 1100, 1380, 8, 50),
  P("Bake Parlor Maida 1kg", "Flour", "Bake Parlor", "pcs", 130, 190, 12, 80),
  // Grocery · Oil
  P("Dalda Cooking Oil 5L", "Oil", "Dalda", "tin", 2450, 2950, 6, 30),
  P("Sufi Banaspati Ghee 1kg", "Oil", "Sufi", "pcs", 480, 620, 10, 60),
  // Grocery · Tea
  P("Tapal Danedar 950g", "Tea", "Tapal", "pack", 1150, 1450, 8, 45),
  P("Lipton Yellow Label 475g", "Tea", "Lipton", "pack", 720, 950, 8, 40),
  // Grocery · Sugar
  P("Refined Sugar 5kg", "Sugar", "Al-Arz", "bag", 720, 880, 10, 70),
  // Grocery · Spices
  P("National Red Chilli 200g", "Spices", "National", "pcs", 180, 280, 12, 90),
  P("Shan Biryani Masala", "Spices", "Shan", "pcs", 110, 180, 15, 120, { option: "Mix", values: [{ v: "Bombay Biryani" }, { v: "Sindhi Biryani" }, { v: "Chicken Korma" }] }),
  P("Turmeric Powder 200g", "Spices", "National", "pcs", 130, 210, 12, 80),
  // Beverages
  P("Coca-Cola 1.5L", "Beverages", "Coca-Cola", "bottle", 130, 180, 18, 140),
  P("Nestle Fruita Vitals 1L", "Beverages", "Nestlé", "pack", 180, 260, 12, 90, { option: "Flavour", values: [{ v: "Mango" }, { v: "Red Grape" }, { v: "Peach" }] }),
  P("Sprite 500ml", "Beverages", "Sprite", "bottle", 60, 90, 24, 160),
  P("Nestle Water 1.5L", "Beverages", "Nestlé", "bottle", 55, 90, 24, 200),
  P("Rooh Afza 800ml", "Beverages", "Hamdard", "bottle", 360, 520, 8, 50),
  // Snacks
  P("Lays Masala 70g", "Snacks", "Lay's", "pack", 70, 100, 24, 180, { option: "Flavour", values: [{ v: "Masala" }, { v: "Salted" }, { v: "Sour Cream" }] }),
  P("Slanty Jalapeno", "Snacks", "Kurkure", "pack", 35, 50, 30, 220),
  P("Peek Freans Sooper", "Snacks", "Peek Freans", "pack", 90, 130, 18, 150),
  P("Dairy Milk Chocolate", "Snacks", "Cadbury", "pcs", 140, 200, 16, 120),
  P("Wavy Chilli Chips", "Snacks", "Wavy", "pack", 70, 100, 24, 140),
  // Personal Care
  P("Colgate MaxFresh 150g", "Personal Care", "Colgate", "pcs", 180, 280, 12, 90),
  P("Lifebuoy Soap 4-pack", "Personal Care", "Lifebuoy", "pack", 280, 420, 10, 70),
  P("Head & Shoulders 200ml", "Personal Care", "H&S", "pcs", 480, 720, 8, 44),
  P("Gillette Razor", "Personal Care", "Gillette", "pcs", 220, 350, 12, 60),
  P("Always Sanitary Pads", "Personal Care", "Always", "pack", 260, 390, 10, 64),
  // Household
  P("Surf Excel 1kg", "Household", "Surf Excel", "pack", 520, 720, 8, 60),
  P("Harpic Toilet Cleaner 1L", "Household", "Harpic", "bottle", 320, 480, 8, 50),
  P("Maxo Mosquito Coil", "Household", "Maxo", "pack", 90, 150, 16, 120),
  P("Rose Petal Tissue Box", "Household", "Rose Petal", "box", 110, 170, 18, 130),
  P("Scotch-Brite Scrubber", "Household", "Scotch-Brite", "pcs", 50, 90, 24, 150),
  // Toys
  P("Building Blocks Set", "Toys", "FunBlocks", "box", 650, 1200, 5, 30, { option: "Size", values: [{ v: "Small (60 pcs)", cost: 650, price: 1200 }, { v: "Large (120 pcs)", cost: 1100, price: 1950 }] }),
  P("Remote Control Car", "Toys", "SpeedX", "pcs", 1400, 2500, 4, 18, { option: "Colour", values: [{ v: "Red" }, { v: "Blue" }] }),
  P("Soft Teddy Bear", "Toys", "Cuddles", "pcs", 480, 950, 6, 28),
  P("Jigsaw Puzzle 100pc", "Toys", "BrainyKids", "box", 220, 420, 8, 40),
  // Gift Packs
  P("Eid Chocolate Hamper", "Gift Packs", "Hamza Gifts", "box", 1200, 2200, 3, 16),
  P("Wedding Gift Box", "Gift Packs", "Hamza Gifts", "box", 1800, 3200, 3, 10),
  // Stationery
  P("Dollar Ball Pen (Box)", "Stationery", "Dollar", "box", 180, 300, 12, 80),
  P("Student Notebook 100pg", "Stationery", "Paramount", "pcs", 60, 110, 20, 160),
  P("Geometry Box", "Stationery", "Oxford", "pcs", 220, 380, 10, 55),
  P("A4 Paper Ream", "Stationery", "Double A", "ream", 950, 1250, 6, 40),
];

async function main() {
  console.log("Connecting…");
  // Allow SVG placeholder images in the product bucket (keeps the existing types).
  await db.storage.updateBucket(BUCKET, {
    public: true, fileSizeLimit: 5_242_880,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/avif", "image/svg+xml"],
  });
  const pg = await connect();

  console.log("Wiping seeded catalogue + transactions (keeping schema/users/settings)…");
  await pg.query(`truncate
    discount_redemptions, payments, sale_items, sales, reservations, order_items, shipments, orders,
    goods_receipt_items, goods_receipts, purchase_order_items, purchase_orders, supplier_ledger,
    customer_ledger, stock_levels, stock_moves, lots,
    product_barcodes, variant_option_values, product_option_values, product_options,
    product_variants, store_listings, collection_products, products, customers, suppliers, categories
    restart identity cascade;`);
  // also clear any previously-seeded discounts so the tab reflects this run
  await pg.query(`delete from discounts;`);
  await pg.end();

  // owner profile (for created_by / cashier_id)
  const { data: prof } = await db.from("profiles").select("id, role").order("role").limit(1).maybeSingle();
  const ownerId = prof?.id ?? null;
  const { data: locs } = await db.from("locations").select("id, code");
  const loc = Object.fromEntries((locs ?? []).map((l) => [l.code, l.id]));

  // ---- categories ----
  console.log("Seeding categories…");
  const catId = {};
  let sort = 0;
  for (const parent of Object.keys(CATS)) {
    const { data } = await db.from("categories").insert({ name: parent, sort: sort++ }).select("id").single();
    catId[parent] = data.id;
  }
  for (const [parent, subs] of Object.entries(CATS)) {
    for (const sub of subs) {
      const { data } = await db.from("categories").insert({ name: sub, parent_id: catId[parent], sort: sort++ }).select("id").single();
      catId[sub] = data.id;
    }
  }
  // map a category name -> its top-level parent (for image colour)
  const parentOf = {};
  for (const [parent, subs] of Object.entries(CATS)) { parentOf[parent] = parent; for (const s of subs) parentOf[s] = parent; }

  // ---- products via create_product_full RPC ----
  console.log(`Seeding ${PRODUCTS.length} products…`);
  const createdVariants = []; // {variant_id, product_id, cost, price, name}
  let skuSeq = 1000;
  for (const p of PRODUCTS) {
    const sku0 = `${slug(p.cat).slice(0, 4).toUpperCase()}-${skuSeq++}`;
    let options = [];
    let variants = [];
    if (p.variants) {
      options = [{ name: p.variants.option, values: p.variants.values.map((x) => x.v) }];
      variants = p.variants.values.map((x, i) => ({
        sku: `${sku0}-${i + 1}`, barcode: nextBarcode(),
        cost: x.cost ?? p.cost, sale_price: x.price ?? p.price,
        reorder_point: p.reorder, opening_qty: Math.round(p.opening / p.variants.values.length),
        option_values: [x.v],
      }));
    } else {
      variants = [{ sku: sku0, barcode: nextBarcode(), cost: p.cost, sale_price: p.price, reorder_point: p.reorder, opening_qty: p.opening, option_values: [] }];
    }
    const payload = {
      name: p.name, brand: p.brand, category_id: catId[p.cat], description: `${p.brand} · ${p.name}`,
      base_unit: p.unit, base_price: p.price, slug: `${slug(p.name)}-${slug(sku0)}`,
      created_by: ownerId, has_variants: !!p.variants, options, variants,
    };
    const { data: pid, error } = await db.rpc("create_product_full", { payload });
    if (error) { console.warn(`  ${p.name}: ${error.message}`); continue; }

    const url = await uploadImage(pid, p.name, p.brand, parentOf[p.cat]);
    if (url) {
      await db.from("products").update({ image_url: url }).eq("id", pid);
      await db.from("store_listings").update({ images: [url] }).eq("product_id", pid);
    }
    // collect default variant for sales/orders
    const { data: vs } = await db.from("product_variants").select("id, cost, sale_price").eq("product_id", pid).order("is_default", { ascending: false });
    if (vs?.length) createdVariants.push({ variant_id: vs[0].id, product_id: pid, cost: Number(vs[0].cost), price: Number(vs[0].sale_price), name: p.name });
  }

  // publish every listing so the storefront isn't empty
  await db.from("store_listings").update({ is_published: true }).neq("product_id", "00000000-0000-0000-0000-000000000000");

  // ---- suppliers + purchasing ----
  console.log("Seeding suppliers + purchases…");
  const SUPP = [
    { name: "Karachi Wholesale Traders", contact_person: "Imran Sheikh", phone: "0300-2345678", city: "Karachi", payment_terms: "30 days", balance: 86500 },
    { name: "Lahore FMCG Distributors", contact_person: "Asif Raza", phone: "0321-9876543", city: "Lahore", payment_terms: "15 days", balance: 42300 },
    { name: "Hamza Cosmetics Supply", contact_person: "Bilal Ahmed", phone: "0333-1122334", city: "Faisalabad", payment_terms: "Cash", balance: 0 },
  ];
  const supIds = [];
  for (const s of SUPP) {
    const { data } = await db.from("suppliers").insert({ ...s, opening_balance: s.balance, active: true }).select("id").single();
    supIds.push(data.id);
    if (s.balance > 0) {
      await db.from("supplier_ledger").insert({ supplier_id: data.id, type: "CHARGE", amount: s.balance, reference: "Opening payable", balance_after: s.balance, created_by: ownerId });
    }
  }
  // a couple of purchase orders so /purchasing has data
  let poSeq = 1;
  for (const [i, status] of [["RECEIVED"], ["SENT"]].entries()) {
    const st = status[0];
    const picks = createdVariants.slice(i * 4, i * 4 + 4);
    const subtotal = picks.reduce((s, v) => s + v.cost * 10, 0);
    const { data: po } = await db.from("purchase_orders").insert({
      po_no: `PO-${String(poSeq++).padStart(4, "0")}`, supplier_id: supIds[i], status: st,
      expected_at: daysAgo(-5).slice(0, 10), subtotal, total: subtotal, created_by: ownerId,
    }).select("id").single();
    for (const v of picks) {
      await db.from("purchase_order_items").insert({ po_id: po.id, product_id: v.product_id, variant_id: v.variant_id, qty: 10, unit_cost: v.cost, received_qty: st === "RECEIVED" ? 10 : 0 });
    }
    if (st === "RECEIVED") {
      await db.from("goods_receipts").insert({ grn_no: `GRN-${String(i + 1).padStart(4, "0")}`, po_id: po.id, supplier_id: supIds[i], location_id: loc.MAIN, received_by: ownerId, total: subtotal, note: "Received in full" });
    }
  }

  // ---- customers (a couple on udhaar) ----
  console.log("Seeding customers…");
  const CUST = [
    // No "Walk-in Customer" row: walk-in is the default (null customer) at the
    // till, so a stored placeholder would just be a confusing duplicate.
    { name: "Ahmed Khan", phone: "0301-2223344", credit_limit: 20000, balance: 7500 },
    { name: "Fatima Bibi", phone: "0345-5566778", credit_limit: 15000, balance: 3200 },
    { name: "Usman Ali", phone: "0312-9988776", credit_limit: 10000, balance: 0 },
    { name: "Sana Tariq", phone: "0322-4455667", credit_limit: 25000, balance: 0 },
    { name: "Bilal Hussain", phone: "0333-7788990", credit_limit: 5000, balance: 0 },
  ];
  const custIds = [];
  for (const c of CUST) {
    const { data } = await db.from("customers").insert({ name: c.name, phone: c.phone, credit_limit: c.credit_limit, credit_balance: c.balance }).select("id").single();
    custIds.push(data.id);
    if (c.balance > 0) {
      await db.from("customer_ledger").insert({ customer_id: data.id, type: "CHARGE", amount: c.balance, reference: "Udhaar carried forward", balance_after: c.balance, created_by: ownerId });
    }
  }

  // ---- POS sales over the last ~18 days ----
  console.log("Seeding POS sales…");
  const sellable = createdVariants.filter((v) => v.price > 0);
  let invSeq = 1;
  for (let i = 0; i < 14; i++) {
    const when = daysAgo(rand(0, 18));
    const n = rand(1, 3);
    const picks = Array.from({ length: n }, () => sellable[rand(0, sellable.length - 1)]);
    let subtotal = 0, cogs = 0;
    const items = picks.map((v) => {
      const qty = rand(1, 3);
      const line = v.price * qty;
      subtotal += line; cogs += v.cost * qty;
      return { v, qty, line };
    });
    const total = subtotal; // no tax/discount on these samples
    const profit = total - cogs;
    const udhaar = i % 5 === 0; // some on khata
    const customer_id = udhaar ? custIds[1] : custIds[0];
    const { data: sale } = await db.from("sales").insert({
      receipt_no: `INV-${String(invSeq++).padStart(6, "0")}`, customer_id, location_id: loc.MAIN,
      subtotal, discount: 0, tax: 0, total, cogs_total: cogs, profit, cashier_id: ownerId, created_at: when,
    }).select("id").single();
    for (const it of items) {
      await db.from("sale_items").insert({ sale_id: sale.id, product_id: it.v.product_id, variant_id: it.v.variant_id, qty: it.qty, unit_price: it.v.price, unit_cogs: it.v.cost, line_total: it.line });
      await db.from("stock_moves").insert({
        product_id: it.v.product_id, variant_id: it.v.variant_id, qty: it.qty, from_location_id: loc.MAIN, to_location_id: loc.CUST,
        unit_cost: it.v.cost, reference_type: "SALE", reference_id: sale.id, source: "MANUAL",
        idempotency_key: `seed-sale-${sale.id}-${it.v.variant_id}`, created_by: ownerId, created_at: when,
      });
    }
    await db.from("payments").insert({ sale_id: sale.id, method: udhaar ? "UDHAAR" : "CASH", amount: total, created_at: when });
  }

  // ---- a couple of web orders ----
  console.log("Seeding web orders…");
  let webSeq = 1;
  for (const [status, payment, custIdx] of [["PLACED", "COD", 2], ["CONFIRMED", "JAZZCASH", 4]]) {
    const picks = [sellable[rand(0, sellable.length - 1)], sellable[rand(0, sellable.length - 1)]];
    let subtotal = 0;
    const items = picks.map((v) => { const qty = rand(1, 2); const line = v.price * qty; subtotal += line; return { v, qty, line }; });
    const delivery = subtotal >= 2500 ? 0 : 150;
    const total = subtotal + delivery;
    const c = CUST[custIdx];
    const { data: order } = await db.from("orders").insert({
      order_no: `W-${String(webSeq++).padStart(5, "0")}`, channel: "web", customer_id: custIds[custIdx],
      customer_name: c.name, customer_phone: c.phone, address: "House 12, Block C, Model Town",
      status, payment_type: payment, subtotal, discount: 0, delivery_fee: delivery, total, created_at: daysAgo(rand(0, 4)),
    }).select("id").single();
    for (const it of items) {
      await db.from("order_items").insert({ order_id: order.id, product_id: it.v.product_id, variant_id: it.v.variant_id, qty: it.qty, unit_price: it.v.price, line_total: it.line });
      await db.from("reservations").insert({ order_id: order.id, product_id: it.v.product_id, variant_id: it.v.variant_id, qty: it.qty, status: "HELD", expires_at: daysAgo(-2) });
    }
  }

  // ---- a few promotions ----
  console.log("Seeding promotions…");
  const eid = new Date(Date.now() + 14 * 86_400_000).toISOString();
  await db.from("discounts").insert([
    { name: "Eid Cosmetics Sale", type: "PERCENT", value: 15, scope: "CATEGORY", target_id: catId.Cosmetics, min_amount: 0, end_at: eid, active: true, description: "15% off all cosmetics for Eid." },
    { name: "Snacks Coupon", type: "PERCENT", value: 10, scope: "CART", code: "SNACK10", min_amount: 500, active: true, description: "Rs 500+ carts get 10% off with code SNACK10." },
    { name: "Free Delivery over 3000", type: "FREE_DELIVERY", value: 0, scope: "CART", min_amount: 3000, active: true, description: "Free home delivery on orders above Rs 3000." },
  ]);

  console.log("\n✓ Reseed complete.");
  console.log(`  ${PRODUCTS.length} products, ${createdVariants.length} default variants, ${CUST.length} customers, ${SUPP.length} suppliers.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
