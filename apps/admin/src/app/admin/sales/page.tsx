import type { Metadata } from "next";
import { SalesClient } from "@/features/sales/SalesClient";
import { getSalesPage } from "@/features/sales/actions";

export const metadata: Metadata = { title: "Sales" };

export default async function SalesPage() {
  const initial = await getSalesPage({ limit: 25, offset: 0 });
  return <SalesClient initial={initial} />;
}
