import crypto from "node:crypto";

// JazzCash Hosted Checkout (Page Redirection). The customer's browser POSTs a
// signed form to JazzCash, pays, and JazzCash POSTs the result back to
// pp_ReturnURL where we re-verify the signature before crediting the order.
//
// NOTE: the secure-hash algorithm (below) is the verifiable core. The exact
// field set can vary by JazzCash product/version — confirm against your current
// JazzCash integration guide and test in their sandbox before going live.

export interface JazzCashConfig {
  merchant: string;
  password: string;
  salt: string; // Integrity Salt
  returnUrl: string;
  sandbox: boolean;
}

/**
 * pp_SecureHash = HMAC-SHA256( IntegritySalt + "&" + sorted-non-empty-values ),
 * keyed by the IntegritySalt, hex (upper-case). Excludes pp_SecureHash itself.
 */
export function jazzcashSecureHash(fields: Record<string, string>, salt: string): string {
  const values = Object.keys(fields)
    .filter((k) => k !== "pp_SecureHash" && fields[k] !== undefined && fields[k] !== "")
    .sort()
    .map((k) => fields[k]);
  const message = `${salt}&${values.join("&")}`;
  return crypto.createHmac("sha256", salt).update(message).digest("hex").toUpperCase();
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Build the signed hosted-checkout form (POST action + hidden fields). */
export function buildJazzCashCheckout(
  order: { order_no: string; total: number; description?: string },
  cfg: JazzCashConfig,
): { action: string; fields: Record<string, string> } {
  const now = new Date();
  const expiry = new Date(now.getTime() + 60 * 60 * 1000);
  const fields: Record<string, string> = {
    pp_Version: "1.1",
    pp_TxnType: "MWALLET",
    pp_Language: "EN",
    pp_MerchantID: cfg.merchant,
    pp_SubMerchantID: "",
    pp_Password: cfg.password,
    pp_BankID: "",
    pp_ProductID: "",
    pp_TxnRefNo: `T${stamp(now)}`,
    pp_Amount: String(Math.round(order.total * 100)), // paisa, integer
    pp_TxnCurrency: "PKR",
    pp_TxnDateTime: stamp(now),
    pp_BillReference: order.order_no,
    pp_Description: order.description ?? `Order ${order.order_no}`,
    pp_TxnExpiryDateTime: stamp(expiry),
    pp_ReturnURL: cfg.returnUrl,
    ppmpf_1: order.order_no, // echoed back so the return handler finds the order
  };
  fields.pp_SecureHash = jazzcashSecureHash(fields, cfg.salt);

  const action = cfg.sandbox
    ? "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/"
    : "https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/";
  return { action, fields };
}

/** Re-verify the signature JazzCash returns on the callback. */
export function verifyJazzCashResponse(fields: Record<string, string>, salt: string): boolean {
  const received = (fields.pp_SecureHash ?? "").toUpperCase();
  if (!received) return false;
  return received === jazzcashSecureHash(fields, salt);
}
