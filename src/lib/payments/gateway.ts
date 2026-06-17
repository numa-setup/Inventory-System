import { createAdminClient } from "@/lib/supabase/admin";
import type { JazzCashConfig } from "./jazzcash";

// Online payment gateway abstraction. The storefront runs in "sandbox" mode
// until real provider credentials are added in Settings → Integrations, at which
// point it flips to "live" and the hosted-checkout / webhook flow takes over.
// Adding a provider = storing its keys + implementing createIntent/verify below.

export type GatewayMode = "sandbox" | "live";
export interface GatewayConfig {
  mode: GatewayMode;
  provider?: "stripe" | "jazzcash" | "easypaisa";
}

export async function getGatewayConfig(): Promise<GatewayConfig> {
  const db = createAdminClient();
  const { data } = await db.from("settings").select("courier_keys").eq("id", 1).maybeSingle();
  const k = (data?.courier_keys ?? {}) as Record<string, string | undefined>;
  // JazzCash is the wired live provider (hosted checkout). It needs all three.
  if (k.jazzcash_merchant && k.jazzcash_password && k.jazzcash_salt) return { mode: "live", provider: "jazzcash" };
  // Stripe / Easypaisa keys can be stored but stay sandbox until their checkout
  // + webhook are implemented.
  return { mode: "sandbox" };
}

export async function getJazzCashConfig(): Promise<JazzCashConfig> {
  const db = createAdminClient();
  const { data } = await db.from("settings").select("courier_keys").eq("id", 1).maybeSingle();
  const k = (data?.courier_keys ?? {}) as Record<string, string | undefined>;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return {
    merchant: k.jazzcash_merchant ?? "",
    password: k.jazzcash_password ?? "",
    salt: k.jazzcash_salt ?? "",
    returnUrl: `${appUrl}/api/payments/jazzcash/return`,
    sandbox: k.jazzcash_sandbox === "true",
  };
}
