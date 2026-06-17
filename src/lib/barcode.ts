// Barcode utilities shared by the universal scan layer (Section 2).
//
// Covers three needs:
//   1. parseScan()        — normalise any scanned string, detecting
//                           weight/price-embedded EAN-13 (variable-weight items)
//                           and producing a stable lookupKey for the catalogue.
//   2. internal code gen  — GS1 prefix-2 EAN-13 for items with no manufacturer
//                           barcode, and weight templates for variable-weight.
//   3. code128Svg()       — dependency-free Code-128B label renderer.
//
// In-store GS1 "prefix 2" convention used here (configurable):
//   - WEIGHT_PREFIXES ("20","21") => weight/price embedded:
//       [PP][IIIII][VVVVV][C]  = 2-digit prefix, 5-digit item ref,
//                                5-digit value, 1 check digit.
//       The scale fills VVVVV per package; we zero it to get the lookup key.
//   - Any other prefix-2 code we generate ("29…") is a plain internal code.

export const WEIGHT_PREFIXES = ["20", "21"];
/** Value field divisor: grams -> kg (1000). Price-mode stores can set 100. */
export const WEIGHT_DIVISOR = 1000;

/** EAN-13 check digit for the first 12 digits. */
export function ean13Check(d12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/** True if a 12/13-digit numeric string is a valid EAN-13 (or completes one). */
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return ean13Check(code.slice(0, 12)) === Number(code[12]);
}

export interface ParsedScan {
  raw: string;
  /** Normalised code as scanned. */
  barcode: string;
  /** What to match against product_barcodes (weight template if embedded). */
  lookupKey: string;
  isWeightEmbedded: boolean;
  /** Decoded quantity in base units (kg) when weight-embedded. */
  weight?: number;
  itemRef?: string;
}

/**
 * Normalise a raw scan. For weight/price-embedded EAN-13 it returns the decoded
 * weight plus a `lookupKey` with the value field zeroed (the template stored on
 * the variant), so a different weight on every package still resolves.
 */
export function parseScan(raw: string): ParsedScan {
  const code = raw.trim();
  if (/^\d{13}$/.test(code) && WEIGHT_PREFIXES.includes(code.slice(0, 2))) {
    const prefix = code.slice(0, 2);
    const itemRef = code.slice(2, 7);
    const value = Number(code.slice(7, 12));
    const template12 = `${prefix}${itemRef}00000`;
    const lookupKey = template12 + ean13Check(template12);
    return {
      raw,
      barcode: code,
      lookupKey,
      isWeightEmbedded: true,
      weight: value / WEIGHT_DIVISOR,
      itemRef,
    };
  }
  return { raw, barcode: code, lookupKey: code, isWeightEmbedded: false };
}

function pad(n: number | string, len: number) {
  return String(n).replace(/\D/g, "").padStart(len, "0").slice(-len);
}

/** Plain internal EAN-13 (prefix "29") for an item with no manufacturer code. */
export function generateInternalEan13(seq: number, prefix = "29"): string {
  const d12 = `${prefix}${pad(seq, 10)}`;
  return d12 + ean13Check(d12);
}

/** Weight-template EAN-13 (value field zeroed) to store on a variable-weight variant. */
export function generateWeightTemplateEan13(itemRef: number, prefix = WEIGHT_PREFIXES[0]): string {
  const d12 = `${prefix}${pad(itemRef, 5)}00000`;
  return d12 + ean13Check(d12);
}

/** Build a concrete weight-embedded code (e.g. for a label preview at a weight). */
export function encodeWeightEan13(itemRef: number, weightKg: number, prefix = WEIGHT_PREFIXES[0]): string {
  const value = Math.round(weightKg * WEIGHT_DIVISOR);
  const d12 = `${prefix}${pad(itemRef, 5)}${pad(value, 5)}`;
  return d12 + ean13Check(d12);
}

// ---- Code-128B (dependency-free) -----------------------------------------
// Canonical 107-entry module-width pattern table (index 106 = stop).
const C128 = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112",
];
const START_B = 104;
const STOP = 106;

/** Code-128B module-width sequence (bars/spaces, starting with a bar). */
export function code128Pattern(text: string): number[] {
  const vals: number[] = [START_B];
  let sum = START_B;
  for (let i = 0; i < text.length; i++) {
    const v = text.charCodeAt(i) - 32; // Code-128B maps ASCII 32..127 -> 0..95
    if (v < 0 || v > 95) continue;
    vals.push(v);
    sum += v * (i + 1);
  }
  vals.push(sum % 103);
  vals.push(STOP);
  const widths: number[] = [];
  for (const v of vals) for (const ch of C128[v]) widths.push(Number(ch));
  return widths;
}

export interface Code128Opts {
  height?: number;
  moduleWidth?: number;
  margin?: number;
  showText?: boolean;
  color?: string;
}

/** Render a Code-128B barcode as a standalone SVG string. */
export function code128Svg(text: string, opts: Code128Opts = {}): string {
  const { height = 56, moduleWidth = 2, margin = 10, showText = true, color = "#111" } = opts;
  const widths = code128Pattern(text);
  const totalModules = widths.reduce((a, b) => a + b, 0);
  const w = totalModules * moduleWidth + margin * 2;
  const textH = showText ? 16 : 0;
  const h = height + textH + margin;

  let x = margin;
  let bar = true; // patterns start with a bar
  let rects = "";
  for (const width of widths) {
    const px = width * moduleWidth;
    if (bar) rects += `<rect x="${x}" y="${margin}" width="${px}" height="${height}" fill="${color}"/>`;
    x += px;
    bar = !bar;
  }
  const label = showText
    ? `<text x="${w / 2}" y="${margin + height + 13}" font-family="monospace" font-size="13" text-anchor="middle" fill="${color}">${text}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="#fff"/>${rects}${label}</svg>`;
}
