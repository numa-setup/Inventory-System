import type { Metadata } from "next";
import { createClient } from "@hamza/shared/supabase/server";
import { getVariantOptions } from "@/lib/catalog";
import { RecordPurchaseClient } from "@/features/purchasing/RecordPurchaseClient";

export const metadata: Metadata = { title: "Record Purchase" };

export default async function RecordPurchasePage() {
  const supabase = await createClient();
  const [variants, { data: suppliers }, { data: locations }] = await Promise.all([
    getVariantOptions(supabase),
    supabase.from("suppliers").select("id, name").eq("active", true).order("name"),
    supabase.from("locations").select("code, name").eq("type", "PHYSICAL").order("code"),
  ]);

  return (
    <RecordPurchaseClient
      variants={variants}
      suppliers={(suppliers ?? []).map((s) => ({ id: s.id, name: s.name }))}
      locations={(locations ?? []).map((l) => ({ code: l.code, name: l.name }))}
    />
  );
}
