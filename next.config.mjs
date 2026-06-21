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
    // Cache the RSC payload of dynamic pages in the client router so navigating
    // back to a screen you just visited is instant instead of re-running every
    // server query. (Next 15 defaults dynamic to 0 = always refetch.) Bumped to
    // 120s so tab-switching stays instant for a normal working session; mutations
    // still invalidate explicitly where freshness matters.
    staleTimes: { dynamic: 120, static: 300 },
    // Tree-shake heavy barrels to per-symbol imports.
    optimizePackageImports: ["lucide-react", "date-fns", "recharts"],
    // Product/variant photo uploads go through server actions as multipart form
    // data. The default body limit is 1 MB, which silently rejected real phone
    // photos (2–5 MB) — raise it so image uploads actually succeed.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
