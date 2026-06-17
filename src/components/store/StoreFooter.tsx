import Link from "next/link";
import type { StoreCategory, StoreInfo } from "@/lib/storefront";

export function StoreFooter({ info, categories }: { info: StoreInfo; categories: StoreCategory[] }) {
  return (
    <footer className="mt-24 border-t border-store-line bg-store-cream">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:px-10">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <div className="font-serif text-2xl tracking-[0.25em] text-store-ink">{info.name.toUpperCase()}</div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-store-muted">
              Everyday essentials and a few fine things — thoughtfully stocked for your home.
            </p>
            {info.phone && <p className="mt-4 text-sm text-store-charcoal">{info.phone}</p>}
            {info.address && <p className="text-sm text-store-muted">{info.address}</p>}
          </div>

          <FooterCol title="Shop">
            <FooterLink href="/shop">All products</FooterLink>
            <FooterLink href="/shop?sort=new">New in</FooterLink>
            {categories.slice(0, 4).map((c) => (
              <FooterLink key={c.name} href={`/shop?category=${encodeURIComponent(c.name)}`}>{c.name}</FooterLink>
            ))}
          </FooterCol>

          <FooterCol title="Customer Care">
            <FooterLink href="/shop/about">About us</FooterLink>
            <FooterLink href="/shop">Delivery</FooterLink>
            <FooterLink href="/shop">Returns</FooterLink>
            <FooterLink href="/shop">Contact</FooterLink>
          </FooterCol>

          <FooterCol title="Newsletter">
            <p className="text-sm text-store-muted">Offers and new arrivals, now and then.</p>
            <form className="mt-3 flex border border-store-line">
              <input placeholder="Email address" className="w-full bg-transparent px-3 py-2 text-sm text-store-ink placeholder:text-store-muted focus:outline-none" />
              <button type="button" className="bg-store-ink px-3 text-xs uppercase tracking-wider text-store-paper">Join</button>
            </form>
          </FooterCol>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-2 border-t border-store-line pt-6 text-xs text-store-muted sm:flex-row">
          <span>© {new Date().getFullYear()} {info.name}. All rights reserved.</span>
          <span>Made with care.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-store-ink">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="block text-sm text-store-charcoal transition-colors hover:text-store-ink">{children}</Link>;
}
