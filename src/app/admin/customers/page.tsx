import type { Metadata } from "next";
import { createClient } from "@hamza/shared/supabase/server";
import { CustomersClient, type CustomerRow } from "@/features/customers/CustomersClient";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("id, name, phone, address, credit_limit, credit_balance")
    .order("name");

  const rows: CustomerRow[] = (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    address: c.address,
    credit_limit: Number(c.credit_limit),
    credit_balance: Number(c.credit_balance),
  }));

  return <CustomersClient rows={rows} />;
}
