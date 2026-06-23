// Product imagery with a refined fallback. When a listing has no photo we render
// a warm monogram tile (serif initial on a soft sand gradient) so the catalogue
// always looks intentional and premium — never a broken/empty box.

const TINTS = [
  "from-[#EFE9DE] to-[#E3D8C6]",
  "from-[#E8E6DC] to-[#D7D3C4]",
  "from-[#EFE6E1] to-[#E0D2C9]",
  "from-[#E6EAE3] to-[#D2D8CC]",
  "from-[#F0EBE3] to-[#E5DBCB]",
];

function tintFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

export function ProductMedia({
  src,
  title,
  seed,
  className = "",
}: {
  src?: string | null;
  title: string;
  seed?: string;
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={title} loading="lazy" className={`h-full w-full object-cover ${className}`} />
    );
  }
  const initial = (title.trim()[0] ?? "•").toUpperCase();
  return (
    <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${tintFor(seed ?? title)} ${className}`}>
      <span className="select-none font-serif text-6xl font-medium text-store-charcoal/35">{initial}</span>
    </div>
  );
}
