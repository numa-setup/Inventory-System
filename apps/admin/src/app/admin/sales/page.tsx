import type { Metadata } from "next";
import { getCurrentUser } from "@hamza/shared/auth";
import { SalesClient } from "@/features/sales/SalesClient";
import { getSalesPage } from "@/features/sales/actions";

export const metadata: Metadata = { title: "Sales" };

export default async function SalesPage() {
  const [initial, user] = await Promise.all([getSalesPage({ limit: 25, offset: 0 }), getCurrentUser()]);
  return <SalesClient initial={initial} isOwner={user?.role === "owner"} />;
}
