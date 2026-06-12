import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHostname = supabaseUrl
  ? new URL(supabaseUrl).hostname
  : undefined;

const nextConfig: NextConfig = {
  // Headless-Chrome PDF rendering (flyers) — keep these out of the bundle.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  // The flyer route loads react-dom/server via a bundler-ignored dynamic
  // import (see lib/flyer/render-html.ts), so the file tracer can't see it —
  // without this, the deployed serverless function ships without react-dom
  // ("Cannot find package 'react-dom'"). Same insurance for chromium's
  // runtime-loaded binary.
  outputFileTracingIncludes: {
    "/api/flyer/*": [
      "./node_modules/react/**/*",
      "./node_modules/react-dom/**/*",
      "./node_modules/scheduler/**/*",
      "./node_modules/@sparticuz/chromium/**/*",
    ],
  },
  experimental: {
    serverActions: {
      // Headroom over the 25 MB video cap enforced in uploadChangelogMedia
      // (FormData multipart adds a small overhead).
      bodySizeLimit: "30mb",
    },
  },
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
