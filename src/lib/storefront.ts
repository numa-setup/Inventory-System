import { createAdminClient } from "@/lib/supabase/admin";

// Server-side data for the public storefront. Reads only published, public
// catalogue data via the service client (it never reaches the browser).

export interface StoreProduct {
  product_id: string;
  slug: string;
  title: string;
  description: string | null;
  price: number;
  images: string[];
  image_url: string | null;
  category_id: string | null;
  category_name: string | null;
  brand: string | null;
  base_unit: string;
  has_variants: boolean;
  is_variable_weight: boolean;
  available: number;
}

export interface StoreVariant {
  variant_id: string;
  label: string;
  sku: string;
  price: number;
  available: number;
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
  "product_id, slug, title, description, price, images, image_url, category_id, category_name, brand, base_unit, has_variants, is_variable_weight, available, sort, created_at";

function mapRow(r: Record<string, unknown>): StoreProduct {
  return {
    product_id: r.product_id as string,
    slug: r.slug as string,
    title: r.title as string,
    description: (r.description as string) ?? null,
    price: Number(r.price),
    images: (r.images as string[]) ?? [],
    image_url: (r.image_url as string) ?? null,
    category_id: (r.category_id as string) ?? null,
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
  const { data } = await query;
  return (data ?? []).map(mapRow);
}

export async function getFeatured(limit = 8): Promise<StoreProduct[]> {
  const db = createAdminClient();
  const { data } = await db.from("store_catalog").select(SELECT).gt("available", 0).order("sort").order("title").limit(limit);
  return (data ?? []).map(mapRow);
}

export async function getProductBySlug(slug: string): Promise<StoreProduct | null> {
  const db = createAdminClient();
  const { data } = await db.from("store_catalog").select(SELECT).eq("slug", slug).maybeSingle();
  return data ? mapRow(data) : null;
}

export async function getProductVariants(productId: string): Promise<StoreVariant[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("catalog_index")
    .select("variant_id, label, sku, price, available")
    .eq("product_id", productId)
    .eq("active", true);
  return (data ?? [])
    .map((v) => ({ variant_id: v.variant_id as string, label: v.label as string, sku: v.sku as string, price: Number(v.price), available: Number(v.available) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function getRelated(categoryName: string | null, excludeSlug: string, limit = 4): Promise<StoreProduct[]> {
  const db = createAdminClient();
  let query = db.from("store_catalog").select(SELECT).neq("slug", excludeSlug).limit(limit);
  if (categoryName) query = query.eq("category_name", categoryName);
  const { data } = await query.order("sort");
  return (data ?? []).map(mapRow);
}
