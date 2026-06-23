// CSV helpers for the bulk product import. Pure functions, unit-tested.

/** Minimal RFC-4180-ish parser: quotes, escaped quotes (""), and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((x) => x.trim() !== "")) rows.push(row); }
  return rows;
}

export interface ParsedProductRow {
  name: string;
  brand?: string;
  category?: string;
  sub_category?: string;
  sku: string;
  barcode?: string;
  unit?: string;
  cost: number;
  price: number;
  discount_type?: string; // "PERCENT" | "FIXED" | ""
  discount_value: number;
  qty: number; // opening stock
  low_stock: number; // reorder point
  status?: string; // "active" | "archived"
  description?: string;
  image_url?: string; // one or more URLs separated by "|"
}

// Header aliases the parser recognises for each field. The first alias is the
// canonical name written into the downloadable template, so the template and the
// parser can never drift apart.
const COLS = {
  name: ["name", "product"],
  brand: ["brand", "make"],
  category: ["category", "category_name"],
  sub_category: ["sub_category", "sub-category", "subcategory", "sub category"],
  sku: ["sku", "code"],
  barcode: ["barcode", "ean"],
  unit: ["unit", "base_unit", "sold by", "sold_by"],
  cost: ["cost", "cost_price", "purchase", "buy"],
  price: ["price", "sale_price", "sale price", "selling_price", "selling price", "retail"],
  discount_type: ["discount_type", "discount type"],
  discount_value: ["discount_value", "discount value", "discount"],
  qty: ["qty", "quantity", "opening_qty", "opening_stock", "opening stock", "opening", "stock", "on_hand"],
  low_stock: ["low_stock", "low stock", "low-stock", "low_stock_threshold", "reorder", "reorder_point", "threshold"],
  status: ["status", "active"],
  description: ["description", "desc"],
  image_url: ["image_url", "image", "images", "image url", "image_urls", "photo"],
} satisfies Record<string, string[]>;
type ColKey = keyof typeof COLS;

/** Parse a product-import CSV (first row = header; flexible column names). */
export function parseProductCsv(text: string): ParsedProductRow[] {
  const grid = parseCsv(text);
  if (grid.length < 2) return [];
  const header = grid[0].map((h) => h.trim().toLowerCase());
  const idx = (key: ColKey) => header.findIndex((h) => (COLS[key] as readonly string[]).includes(h));
  const cols = Object.fromEntries((Object.keys(COLS) as ColKey[]).map((k) => [k, idx(k)])) as Record<ColKey, number>;
  const str = (r: string[], k: ColKey) => (cols[k] >= 0 ? r[cols[k]] : "")?.trim() ?? "";
  const num = (r: string[], k: ColKey) => Number(cols[k] >= 0 ? r[cols[k]] : 0) || 0;

  return grid.slice(1).map((r) => ({
    name: str(r, "name"),
    brand: str(r, "brand") || undefined,
    category: str(r, "category") || undefined,
    sub_category: str(r, "sub_category") || undefined,
    sku: str(r, "sku"),
    barcode: str(r, "barcode") || undefined,
    unit: str(r, "unit") || undefined,
    cost: num(r, "cost"),
    price: num(r, "price"),
    discount_type: str(r, "discount_type") || undefined,
    discount_value: num(r, "discount_value"),
    qty: num(r, "qty"),
    low_stock: num(r, "low_stock"),
    status: str(r, "status") || undefined,
    description: str(r, "description") || undefined,
    image_url: str(r, "image_url") || undefined,
  }));
}

/**
 * The columns the importer reads — the single source of truth for the
 * downloadable CSV template, covering EVERY field on the Add Product form plus an
 * image-URL column. Each `header` is the canonical name `parseProductCsv` reads,
 * so the template can never drift from the parser. Order mirrors the Add Product
 * form (Basics → Pricing → Stock → Identifiers → Media).
 */
export const PRODUCT_IMPORT_COLUMNS = [
  { header: "name", required: true, example: "Maybelline SuperStay Lipstick" },
  { header: "brand", required: false, example: "Maybelline" },
  { header: "category", required: false, example: "Beauty" },
  { header: "sub_category", required: false, example: "Lipstick" },
  { header: "sku", required: true, example: "MBL-SS-RUBY" },
  { header: "barcode", required: false, example: "8901234567890" },
  { header: "unit", required: false, example: "pcs" },
  { header: "cost", required: false, example: "450" },
  { header: "price", required: true, example: "699" },
  { header: "discount_type", required: false, example: "PERCENT" },
  { header: "discount_value", required: false, example: "10" },
  { header: "opening_stock", required: false, example: "24" },
  { header: "low_stock", required: false, example: "5" },
  { header: "status", required: false, example: "active" },
  { header: "description", required: false, example: "Long-lasting matte liquid lipstick" },
  { header: "image_url", required: false, example: "https://picsum.photos/seed/lipstick/600" },
] as const;

/** Build the ready-to-use import template: header row + one realistic sample row. */
export function buildProductCsvTemplate(): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = PRODUCT_IMPORT_COLUMNS.map((c) => c.header).join(",");
  const sample = PRODUCT_IMPORT_COLUMNS.map((c) => esc(c.example)).join(",");
  return `${header}\n${sample}\n`;
}
