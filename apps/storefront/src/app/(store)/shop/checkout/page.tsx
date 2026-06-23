import { getDeliveryConfig, loadStorePromotions } from "@/lib/storefront";
import { CheckoutForm } from "@/components/store/CheckoutForm";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const [config, promotions] = await Promise.all([getDeliveryConfig(), loadStorePromotions()]);
  return <CheckoutForm config={config} promotions={promotions} />;
}
