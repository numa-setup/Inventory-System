import crypto from "node:crypto";

// Easypaisa "Easypay" Hosted Checkout. The customer's browser POSTs a signed form
// to Easypaisa, pays, and Easypaisa redirects back to postBackURL with the result.
//
// Unlike JazzCash (HMAC), Easypaisa signs the request with AES-128-ECB: the sorted
// "key=value&..." string is encrypted with the 16-char merchant hash key and
// Base64-encoded into merchantHashedReq.
//
// NOTE: confirm the exact field set + response handling against your current
// Easypaisa integration guide and test in their staging environment before going
// live. Easypaisa's hash key must be exactly 16 characters (AES-128).

export interface EasypaisaConfig {
  storeId: string;
  hashKey: string; // 16-char AES-128 key
  returnUrl: string;
  sandbox: boolean;
}

/** merchantHashedReq = Base64( AES-128-ECB( sorted "k=v&k=v…", hashKey ) ). */
export function easypaisaHash(params: Record<string, string>, hashKey: string): string {
  const data = Object.keys(params)
    .filter((k) => k !== "merchantHashedReq" && params[k] !== undefined && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const cipher = crypto.createCipheriv("aes-128-ecb", Buffer.from(hashKey, "utf8"), null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(data, "utf8"), cipher.final()]).toString("base64");
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Build the signed Easypay hosted-checkout form (POST action + hidden fields). */
export function buildEasypaisaCheckout(
  order: { order_no: string; total: number },
  cfg: EasypaisaConfig,
): { action: string; fields: Record<string, string> } {
  const fields: Record<string, string> = {
    storeId: cfg.storeId,
    amount: order.total.toFixed(1),
    postBackURL: cfg.returnUrl,
    orderRefNum: order.order_no,
    expiryDate: stamp(new Date(Date.now() + 60 * 60 * 1000)),
    paymentMethod: "MA_PAYMENT_METHOD",
    autoRedirect: "0",
  };
  fields.merchantHashedReq = easypaisaHash(fields, cfg.hashKey);

  const action = cfg.sandbox
    ? "https://easypaystg.easypaisa.com.pk/easypay/Index.jsf"
    : "https://easypay.easypaisa.com.pk/easypay/Index.jsf";
  return { action, fields };
}

/** True when Easypaisa's postback indicates a successful payment. */
export function easypaisaSucceeded(params: Record<string, string>): boolean {
  const code = params.status ?? params.responseCode ?? params.transactionStatus ?? "";
  return code === "0000" || /^(paid|success|completed)$/i.test(code);
}
