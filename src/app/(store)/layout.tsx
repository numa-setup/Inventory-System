import type { Metadata } from "next";
import { getStoreInfo, getCategories } from "@/lib/storefront";
import { CartProvider } from "@/components/store/CartProvider";
import { WishlistProvider } from "@/components/store/WishlistProvider";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreFooter } from "@/components/store/StoreFooter";
import { CartDrawer } from "@/components/store/CartDrawer";

export async function generateMetadata(): Promise<Metadata> {
  const info = await getStoreInfo();
  return {
    title: { default: info.name, template: `%s · ${info.name}` },
    description: `Shop everyday essentials and fine things at ${info.name}.`,
  };
}

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [info, categories] = await Promise.all([getStoreInfo(), getCategories()]);
  return (
    <WishlistProvider>
      <CartProvider>
        <div className="flex min-h-screen flex-col bg-store-cream font-body text-store-charcoal antialiased">
          <StoreHeader storeName={info.name} categories={categories} />
          <main className="flex-1">{children}</main>
          <StoreFooter info={info} categories={categories} />
          <CartDrawer />
        </div>
      </CartProvider>
    </WishlistProvider>
  );
}
