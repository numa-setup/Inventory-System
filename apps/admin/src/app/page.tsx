import { redirect } from "next/navigation";

// The admin app has no public landing page — send the root straight to the admin
// area, which in turn routes to the dashboard (or to /login when not signed in).
export default function RootPage() {
  redirect("/admin");
}
