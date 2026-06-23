// Receipt/invoice data shapes. There is ONE invoice template in the system —
// lib/receipt-pdf.ts (buildReceiptPdf) — used for the POS "Sale complete"
// preview, Print/Download, and the WhatsApp PDF alike. These types describe the
// data pulled from a sale record that the template renders.

export interface ReceiptItem {
  name: string;
  label?: string;
  qty: number;
  /** Product unit shown next to the qty (e.g. Pcs / Kg). */
  unit?: string | null;
  unit_price: number;
  /** Per-line discount in rupees (off the gross line). */
  discount?: number;
  line_total: number;
}

export interface ReceiptStore {
  name: string;
  address?: string;
  phone?: string;
  logo_url?: string;
  header?: string;
  footer?: string;
  ntn?: string;
}

export interface ReceiptData {
  store: ReceiptStore;
  receipt_no: string;
  date: string; // already formatted
  cashier: string;
  customer?: string | null;
  /** Customer address line shown under the name on the invoice. */
  customer_address?: string | null;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  tax: number;
  tax_percent: number;
  total: number;
  payments: { method: string; amount: number }[];
  change: number;
}
