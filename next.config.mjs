/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "qdftxmdxernjzwipqyrq.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  experimental: {
    // Cache the RSC payload of dynamic pages in the client router for 30s so
    // navigating back to a screen you just visited is instant instead of
    // re-running every server query. (Next 15 defaults dynamic to 0 = always refetch.)
    staleTimes: { dynamic: 30, static: 180 },
    // Tree-shake heavy barrels to per-symbol imports.
    optimizePackageImports: ["lucide-react", "date-fns", "recharts"],
  },
};

export default nextConfig;
