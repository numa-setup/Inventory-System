import { getDeliveryConfig } from "@/lib/storefront";
import { CheckoutForm } from "@/components/store/CheckoutForm";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const config = await getDeliveryConfig();
  return <CheckoutForm config={config} />;
}
