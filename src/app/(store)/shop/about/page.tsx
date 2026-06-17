import Link from "next/link";
import { getStoreInfo } from "@/lib/storefront";

export const metadata = { title: "About" };

export default async function AboutPage() {
  const info = await getStoreInfo();
  return (
    <div className="mx-auto max-w-3xl px-5 py-20 text-center lg:px-10">
      <p className="text-[11px] uppercase tracking-[0.25em] text-store-olive">Our story</p>
      <h1 className="mt-5 font-serif text-5xl leading-tight text-store-ink">{info.name}</h1>
      <div className="mx-auto mt-10 max-w-prose space-y-6 text-left text-[15px] leading-relaxed text-store-charcoal">
        <p>
          What began as a neighbourhood shop is now a carefully kept shelf for the modern household —
          grocery and beverages, home and personal care, and a few fine things worth the trip.
        </p>
        <p>
          We stock with intent: trusted brands, fair prices and fresh rotation. The same care we put
          across the counter now reaches your door, with easy delivery and simple returns.
        </p>
        <p>
          Thank you for shopping with us. {info.phone ? `Questions? Call ${info.phone}.` : ""}
        </p>
      </div>
      <Link href="/shop" className="mt-12 inline-block bg-store-ink px-7 py-3.5 text-xs uppercase tracking-[0.18em] text-store-paper transition-opacity hover:opacity-90">
        Start shopping
      </Link>
    </div>
  );
}
