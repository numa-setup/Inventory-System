import { redirect } from "next/navigation";

// The domain root is the customer storefront. Staff reach the admin via /login
// (and the discreet "Staff" link in the storefront footer).
export default function Home() {
  redirect("/shop");
}
