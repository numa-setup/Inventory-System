import { createAdminClient } from "@hamza/shared/supabase/admin";
import { productSalePrice, type Promotion } from "@hamza/shared/discounts";
import { PROMO_SELECT, mapPromotion } from "@hamza/shared/promotions";

// Server-side data for the public storefront. Reads only published, public
// catalogue data via the service client (it never reaches the browser).

export interface StoreProduct {
  product_id: string;
  slug: string;
  title: string;
  description: string | null;
  price: number;
  /** Discounted price from an active promotion (null = no sale). */
  sale_price: number | null;
  /** Short sale label e.g. "15% off" (null = no sale). */
  sale_label: string | null;
  images: string[];
  image_url: string | null;
  category_id: string | null;
  category_parent_id: string | null;
  category_name: string | null;
  brand: string | null;
  base_unit: string;
  has_variants: boolean;
  is_variable_weight: boolean;
  available: number;
}

/** Active promotions for the storefront (service client; schedule enforced at use). */
export async function loadStorePromotions(): Promise<Promotion[]> {
  const db = createAdminClient();
  const { data } = await db.from("discounts").select(PROMO_SELECT).eq("active", true);
  return (data ?? []).map(mapPromotion);
}

export interface StoreVariant {
  variant_id: string;
  label: string;
  sku: string;
  price: number;
  available: number;
  /** Effective image (variant photo, else product photo). */
  image_url: string | null;
}

export interface StoreCategory {
  name: string;
  count: number;
}

export interface StoreInfo {
  name: string;
  phone?: string;
  address?: string;
  logo_url?: string;
}

const SELECT =
  "product_id, slug, title, description, price, images, image_url, category_id, category_parent_id, category_name, brand, base_unit, has_variants, is_variable_weight, available, sort, created_at";

function mapRow(r: Record<string, unknown>, promotions: Promotion[] = []): StoreProduct {
  const price = Number(r.price);
  const category_id = (r.category_id as string) ?? null;
  const category_parent_id = (r.category_parent_id as string) ?? null;
  const sale = productSalePrice(
    { product_id: r.product_id as string, category_ids: [category_id, category_parent_id].filter(Boolean) as string[], price },
    promotions,
  );
  return {
    product_id: r.product_id as string,
    slug: r.slug as string,
    title: r.title as string,
    description: (r.description as string) ?? null,
    price,
    sale_price: sale.compareAt != null ? sale.price : null,
    sale_label: sale.label,
    images: (r.images as string[]) ?? [],
    image_url: (r.image_url as string) ?? null,
    category_id,
    category_parent_id,
    category_name: (r.category_name as string) ?? null,
    brand: (r.brand as string) ?? null,
    base_unit: (r.base_unit as string) ?? "pcs",
    has_variants: Boolean(r.has_variants),
    is_variable_weight: Boolean(r.is_variable_weight),
    available: Number(r.available),
  };
}

export async function getStoreInfo(): Promise<StoreInfo> {
  const db = createAdminClient();
  const { data } = await db.from("settings").select("store_name, store_info").eq("id", 1).maybeSingle();
  const info = (data?.store_info ?? {}) as Record<string, string | undefined>;
  return { name: data?.store_name ?? "Hamza General Store", phone: info.phone, address: info.address, logo_url: info.logo_url };
}

export async function getCategories(): Promise<StoreCategory[]> {
  const db = createAdminClient();
  const { data } = await db.from("store_catalog").select("category_name");
  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    const n = (r.category_name as string) ?? null;
    if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function getCatalog(opts: { category?: string; q?: string; sort?: string } = {}): Promise<StoreProduct[]> {
  const db = createAdminClient();
  let query = db.from("store_catalog").select(SELECT);
  if (opts.category) query = query.eq("category_name", opts.category);
  if (opts.q) {
    const s = opts.q.replace(/[(),%*]/g, " ").trim();
    if (s) query = query.or(`title.ilike.%${s}%,brand.ilike.%${s}%`);
  }
  if (opts.sort === "price_asc") query = query.order("price", { ascending: true });
  else if (opts.sort === "price_desc") query = query.order("price", { ascending: false });
  else if (opts.sort === "new") query = query.order("created_at", { ascending: false });
  else query = query.order("sort").order("title");
  const [{ data }, promos] = await Promise.all([query, loadStorePromotions()]);
  return (data ?? []).map((r) => mapRow(r, promos));
}

export async function getFeatured(limit = 8): Promise<StoreProduct[]> {
  const db = createAdminClient();
  const [{ data }, promos] = await Promise.all([
    db.from("store_catalog").select(SELECT).gt("available", 0).order("sort").order("title").limit(limit),
    loadStorePromotions(),
  ]);
  return (data ?? []).map((r) => mapRow(r, promos));
}

export async function getProductBySlug(slug: string): Promise<StoreProduct | null> {
  const db = createAdminClient();
  const [{ data }, promos] = await Promise.all([
    db.from("store_catalog").select(SELECT).eq("slug", slug).maybeSingle(),
    loadStorePromotions(),
  ]);
  return data ? mapRow(data, promos) : null;
}

export async function getProductVariants(productId: string): Promise<StoreVariant[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("catalog_index")
    .select("variant_id, label, sku, price, available, image_url")
    .eq("product_id", productId)
    .eq("active", true);
  return (data ?? [])
    .map((v) => ({ variant_id: v.variant_id as string, label: v.label as string, sku: v.sku as string, price: Number(v.price), available: Number(v.available), image_url: (v.image_url as string) ?? null }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export interface DeliveryConfig {
  fee: number;
  freeOver: number;
}

export async function getDeliveryConfig(): Promise<DeliveryConfig> {
  const db = createAdminClient();
  const { data } = await db.from("settings").select("store_info").eq("id", 1).maybeSingle();
  const info = (data?.store_info ?? {}) as Record<string, unknown>;
  return { fee: Number(info.delivery_fee ?? 150), freeOver: Number(info.free_delivery_over ?? 2500) };
}

export interface StoreOrder {
  order_no: string;
  status: string;
  customer_name: string;
  customer_phone: string;
  address: string | null;
  payment_type: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  created_at: string;
  items: { title: string; qty: number; unit_price: number; line_total: number }[];
}

export async function getOrderByNo(orderNo: string): Promise<StoreOrder | null> {
  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select("id, order_no, status, customer_name, customer_phone, address, payment_type, subtotal, delivery_fee, total, created_at")
    .eq("order_no", orderNo)
    .maybeSingle();
  if (!order) return null;

  const { data: items } = await db.from("order_items").select("product_id, qty, unit_price, line_total").eq("order_id", order.id);
  const ids = [...new Set((items ?? []).map((i) => i.product_id))];
  const { data: prods } = ids.length ? await db.from("products").select("id, name").in("id", ids) : { data: [] as { id: string; name: string }[] };
  const nameMap = new Map((prods ?? []).map((p) => [p.id, p.name as string]));

  return {
    order_no: order.order_no,
    status: order.status,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    address: order.address,
    payment_type: order.payment_type,
    subtotal: Number(order.subtotal),
    delivery_fee: Number(order.delivery_fee),
    total: Number(order.total),
    created_at: order.created_at,
    items: (items ?? []).map((i) => ({
      title: nameMap.get(i.product_id) ?? "Item",
      qty: Number(i.qty),
      unit_price: Number(i.unit_price),
      line_total: Number(i.line_total),
    })),
  };
}

export async function getRelated(categoryName: string | null, excludeSlug: string, limit = 4): Promise<StoreProduct[]> {
  const db = createAdminClient();
  let query = db.from("store_catalog").select(SELECT).neq("slug", excludeSlug).limit(limit);
  if (categoryName) query = query.eq("category_name", categoryName);
  const [{ data }, promos] = await Promise.all([query.order("sort"), loadStorePromotions()]);
  return (data ?? []).map((r) => mapRow(r, promos));
}
