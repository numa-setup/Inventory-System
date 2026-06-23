import { createAdminClient } from "@hamza/shared/supabase/admin";
import type { JazzCashConfig } from "./jazzcash";
import type { EasypaisaConfig } from "./easypaisa";

// Online payment gateway abstraction. The storefront runs in "sandbox" mode until
// real provider credentials are added in Settings → Integrations, at which point it
// flips to "live". JazzCash and Easypaisa hosted checkout are both wired; when more
// than one is configured the customer chooses at the payment step.

export type Provider = "jazzcash" | "easypaisa";
export type GatewayMode = "sandbox" | "live";
export interface GatewayConfig {
  mode: GatewayMode;
  providers: Provider[];
}

async function courierKeys() {
  const db = createAdminClient();
  const { data } = await db.from("settings").select("courier_keys").eq("id", 1).maybeSingle();
  return (data?.courier_keys ?? {}) as Record<string, string | undefined>;
}

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

export async function getGatewayConfig(): Promise<GatewayConfig> {
  const k = await courierKeys();
  const providers: Provider[] = [];
  if (k.jazzcash_merchant && k.jazzcash_password && k.jazzcash_salt) providers.push("jazzcash");
  if (k.easypaisa_store && k.easypaisa_key) providers.push("easypaisa");
  return { mode: providers.length ? "live" : "sandbox", providers };
}

export async function getJazzCashConfig(): Promise<JazzCashConfig> {
  const k = await courierKeys();
  return {
    merchant: k.jazzcash_merchant ?? "",
    password: k.jazzcash_password ?? "",
    salt: k.jazzcash_salt ?? "",
    returnUrl: `${appUrl()}/api/payments/jazzcash/return`,
    sandbox: k.jazzcash_sandbox === "true",
  };
}

export async function getEasypaisaConfig(): Promise<EasypaisaConfig> {
  const k = await courierKeys();
  return {
    storeId: k.easypaisa_store ?? "",
    hashKey: k.easypaisa_key ?? "",
    returnUrl: `${appUrl()}/api/payments/easypaisa/return`,
    sandbox: k.easypaisa_sandbox === "true",
  };
}
