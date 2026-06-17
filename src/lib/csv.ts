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
  sku: string;
  barcode?: string;
  price: number;
  cost: number;
  qty: number;
}

const COLS: Record<string, string[]> = {
  name: ["name", "product"],
  sku: ["sku", "code"],
  barcode: ["barcode", "ean"],
  price: ["price", "sale_price", "sale price", "retail"],
  cost: ["cost", "purchase", "buy"],
  qty: ["qty", "quantity", "opening_qty", "opening", "stock", "on_hand"],
};

/** Parse a product-import CSV (first row = header; flexible column names). */
export function parseProductCsv(text: string): ParsedProductRow[] {
  const grid = parseCsv(text);
  if (grid.length < 2) return [];
  const header = grid[0].map((h) => h.trim().toLowerCase());
  const idx = (key: string) => header.findIndex((h) => COLS[key].includes(h));
  const iName = idx("name"), iSku = idx("sku"), iBar = idx("barcode"), iPrice = idx("price"), iCost = idx("cost"), iQty = idx("qty");
  return grid.slice(1).map((r) => ({
    name: (iName >= 0 ? r[iName] : "")?.trim() ?? "",
    sku: (iSku >= 0 ? r[iSku] : "")?.trim() ?? "",
    barcode: (iBar >= 0 ? r[iBar] : "")?.trim() || undefined,
    price: Number(iPrice >= 0 ? r[iPrice] : 0) || 0,
    cost: Number(iCost >= 0 ? r[iCost] : 0) || 0,
    qty: Number(iQty >= 0 ? r[iQty] : 0) || 0,
  }));
}
