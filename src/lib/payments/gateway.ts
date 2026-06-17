import { createAdminClient } from "@/lib/supabase/admin";

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
  if (k.stripe_secret) return { mode: "live", provider: "stripe" };
  if (k.jazzcash_merchant && k.jazzcash_password) return { mode: "live", provider: "jazzcash" };
  if (k.easypaisa_store && k.easypaisa_key) return { mode: "live", provider: "easypaisa" };
  return { mode: "sandbox" };
}

// When a provider is wired, implement these:
//   createPaymentIntent(order)  -> redirect URL to the hosted checkout
//   verifyWebhook(payload, sig) -> confirmed payment to credit the order
// In live mode the order is credited by the verified webhook, never by the
// client, so confirmOnlinePayment is gated to sandbox.
