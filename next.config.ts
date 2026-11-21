import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // PGlite ships WASM and worker files; keep it (and pg) out of the bundler.
  // Nothing is kept external. pg (Node servers) and PGlite (local development)
  // are imported through variables in src/server/db/client.ts, so the bundler
  // and output tracing leave them alone and the Cloudflare Worker ships neither;
  // on Workers the Neon serverless driver is used instead.
  serverExternalPackages: [],
  outputFileTracingExcludes: { "*": ["./node_modules/@electric-sql/pglite/**"] },
  poweredByHeader: false,
  // Cloudflare Workers serve images as static assets; no optimizer runs there.
  images: { unoptimized: true },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    },
  ],
};

export default nextConfig;

// Local development against Cloudflare bindings (opt in): OPENNEXT_DEV=1 npm run dev
if (process.env.OPENNEXT_DEV === "1") {
  import("@opennextjs/cloudflare").then(({ initOpenNextCloudflareForDev }) => initOpenNextCloudflareForDev());
}
