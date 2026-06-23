import type { Metadata } from "next";
import { createClient } from "@hamza/shared/supabase/server";
import { resolveRange } from "@hamza/shared/dates";
import { buildReport } from "@/features/reports/queries";
import { ReportsClient } from "@/features/reports/ReportsClient";

export const metadata: Metadata = { title: "Reports" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const reportKey = one(sp.report) || "sales";
  const range = resolveRange(one(sp.preset), one(sp.from), one(sp.to));

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v !== undefined) params.set(k, one(v));

  const supabase = await createClient();
  const data = await buildReport(supabase, reportKey, range, params);

  return <ReportsClient reportKey={reportKey} data={data} />;
}
