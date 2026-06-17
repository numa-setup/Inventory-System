import Link from "next/link";
import { getCatalog, getCategories } from "@/lib/storefront";
import { ProductCard } from "@/components/store/ProductCard";

export const metadata = { title: "Shop" };

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const filtered = Boolean(sp.category || sp.q || (sp.sort && sp.sort !== "featured"));
  const [products, categories] = await Promise.all([
    getCatalog({ category: sp.category, q: sp.q, sort: sp.sort }),
    getCategories(),
  ]);

  if (filtered) {
    const heading = sp.category ?? (sp.q ? `“${sp.q}”` : sp.sort === "new" ? "New in" : "All products");
    return (
      <div className="mx-auto max-w-7xl px-5 py-10 lg:px-10">
        <div className="mb-8 text-center">
          <p className="text-[11px] uppercase tracking-[0.2em] text-store-muted">Shop</p>
          <h1 className="mt-2 font-serif text-4xl text-store-ink">{heading}</h1>
          <p className="mt-2 text-sm text-store-muted">{products.length} item{products.length !== 1 ? "s" : ""}</p>
        </div>

        {/* filter bar */}
        <div className="mb-10 flex flex-wrap items-center justify-center gap-2">
          <Chip href="/shop" active={!sp.category}>All</Chip>
          {categories.map((c) => (
            <Chip key={c.name} href={`/shop?category=${encodeURIComponent(c.name)}`} active={sp.category === c.name}>{c.name}</Chip>
          ))}
        </div>

        {products.length === 0 ? (
          <p className="py-20 text-center text-store-muted">Nothing here yet.</p>
        ) : (
          <Grid products={products} />
        )}
      </div>
    );
  }

  // ---- Home ----
  const featured = products.slice(0, 8);
  return (
    <div>
      {/* hero */}
      <section className="border-b border-store-line bg-store-cream">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 py-20 lg:grid-cols-2 lg:px-10 lg:py-28">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-store-olive">Hamza General Store</p>
            <h1 className="mt-5 font-serif text-5xl leading-[1.05] text-store-ink lg:text-6xl">
              Everyday essentials,<br />beautifully kept.
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-store-muted">
              Grocery, home and personal care — a thoughtfully stocked shelf for the modern household,
              delivered to your door.
            </p>
            <div className="mt-8 flex items-center gap-4">
              <Link href="/shop?sort=featured" className="bg-store-ink px-7 py-3.5 text-xs uppercase tracking-[0.18em] text-store-paper transition-opacity hover:opacity-90">
                Shop the shelf
              </Link>
              <Link href="/shop?sort=new" className="text-sm text-store-ink underline underline-offset-4">New arrivals</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {featured.slice(0, 2).map((p) => (
              <Link key={p.product_id} href={`/shop/product/${p.slug}`} className="group relative aspect-[3/4] overflow-hidden bg-store-sand">
                <div className="flex h-full w-full items-center justify-center">
                  <span className="px-4 text-center font-serif text-2xl text-store-charcoal/45">{p.title}</span>
                </div>
                <span className="absolute bottom-3 left-3 text-xs uppercase tracking-wider text-store-charcoal/70">{p.category_name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* categories */}
      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-10">
        <div className="mb-8 flex items-baseline justify-between">
          <h2 className="font-serif text-2xl text-store-ink">Shop by category</h2>
          <Link href="/shop" className="text-sm text-store-charcoal underline underline-offset-4">View all</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((c) => (
            <Link key={c.name} href={`/shop?category=${encodeURIComponent(c.name)}`} className="group flex aspect-square flex-col items-center justify-center gap-1 border border-store-line bg-store-paper text-center transition-colors hover:bg-store-sand">
              <span className="font-serif text-lg text-store-ink">{c.name}</span>
              <span className="text-[11px] uppercase tracking-wider text-store-muted">{c.count} items</span>
            </Link>
          ))}
        </div>
      </section>

      {/* featured grid */}
      <section className="mx-auto max-w-7xl px-5 pb-10 lg:px-10">
        <div className="mb-8 flex items-baseline justify-between">
          <h2 className="font-serif text-2xl text-store-ink">Featured</h2>
          <Link href="/shop?sort=featured" className="text-sm text-store-charcoal underline underline-offset-4">Shop all</Link>
        </div>
        <Grid products={featured} />
      </section>

      {/* promise strip */}
      <section className="border-t border-store-line">
        <div className="mx-auto grid max-w-7xl grid-cols-1 divide-y divide-store-line px-5 py-12 text-center sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:px-10">
          {[
            ["Fresh stock", "Replenished daily from trusted suppliers"],
            ["Doorstep delivery", "Across the city, every day"],
            ["Easy returns", "Not right? Send it back, simply"],
          ].map(([t, d]) => (
            <div key={t} className="px-6 py-4">
              <div className="font-serif text-lg text-store-ink">{t}</div>
              <div className="mt-1 text-sm text-store-muted">{d}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Grid({ products }: { products: Awaited<ReturnType<typeof getCatalog>> }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => <ProductCard key={p.product_id} p={p} />)}
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`border px-4 py-1.5 text-xs uppercase tracking-[0.12em] transition-colors ${active ? "border-store-ink bg-store-ink text-store-paper" : "border-store-line text-store-charcoal hover:border-store-ink"}`}
    >
      {children}
    </Link>
  );
}
