import { redirect } from "next/navigation";

// The admin portal lives under /admin/* — its landing is the dashboard.
export default function AdminIndex() {
  redirect("/admin/dashboard");
}
