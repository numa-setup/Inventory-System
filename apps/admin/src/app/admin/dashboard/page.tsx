import type { Metadata } from "next";
import { createClient } from "@hamza/shared/supabase/server";
import { resolveRange } from "@hamza/shared/dates";
import { buildDashboard } from "@/features/dashboard/queries";
import { DashboardClient } from "@/features/dashboard/DashboardClient";

export const metadata: Metadata = { title: "Dashboard" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const range = resolveRange(one(sp.preset) || "this_month", one(sp.from), one(sp.to));
  const supabase = await createClient();
  const data = await buildDashboard(supabase, range);
  return <DashboardClient data={data} />;
}
