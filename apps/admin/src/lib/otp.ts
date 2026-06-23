// Admin auth crypto helpers. Uses Web Crypto (crypto.subtle) so the SAME code
// runs in the edge middleware (cookie verify) and in node server actions
// (code hashing + cookie sign). No secrets are stored here — the signing secret
// is read from ADMIN_OTP_SECRET at call time.

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

/** The cookie that marks a session as OTP-verified (the 2nd factor). */
export const OTP_COOKIE = "admin_otp";

/** A 6-digit one-time code. */
export function generateCode(): string {
  // crypto.getRandomValues for an unbiased 6-digit code
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

/** SHA-256 hex of a string (used to store codes hashed, never in plaintext). */
export async function sha256(s: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** Sign an OTP-verified session token: `<userId>.<expMs>.<hmac>`. */
export async function signOtpSession(userId: string, ttlMs: number, secret: string): Promise<string> {
  const payload = `${userId}.${Date.now() + ttlMs}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payload));
  return `${payload}.${hex(sig)}`;
}

/** Verify an OTP-verified session token; returns the userId if valid+unexpired. */
export async function verifyOtpSession(token: string | undefined, secret: string): Promise<string | null> {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  if (!userId || !exp || Number(exp) < Date.now()) return null;
  const expected = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`${userId}.${exp}`));
  // constant-time-ish compare
  const a = hex(expected);
  if (a.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? userId : null;
}
