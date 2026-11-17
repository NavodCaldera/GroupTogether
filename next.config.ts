import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  async headers() {
    const production = process.env.NODE_ENV === "production";
    const development = process.env.NODE_ENV === "development";
    const csp = [
      "default-src 'self'",
      // Next's inline bootstrap needs unsafe-inline without nonces; nonces require a proxy.
      // WebAssembly for on-phone measuring and the fit viewer's DRACO decoder (DEC-020).
      `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://unpkg.com${development ? " 'unsafe-eval'" : ""}`,
      // three.js runs the DRACO decoder in a blob: worker.
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline' https://unpkg.com",
      "img-src 'self' data: blob: https://tile.openstreetmap.org https://unpkg.com",
      "font-src 'self'",
      `connect-src 'self' https://photon.komoot.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io${development ? " ws: wss:" : ""}`,
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      ...(production ? ["upgrade-insecure-requests"] : []),
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          ...(production
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
            : []),
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Simulated garments are named by content hash, so they never change (DEC-020).
        source: "/fit-assets/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // Config headers override route responses in this Next version; preserve private sandbox CSPs.
        source: "/:path((?!api/(?:partner-docs|lab-reports)(?:/|$)).*)",
        headers: [{ key: "Content-Security-Policy", value: csp }],
      },
    ];
  },
  // `npm run dev:phone`: a phone on the same Wi-Fi opens https://<DEV_PHONE_HOST>:3002.
  allowedDevOrigins: process.env.DEV_PHONE_HOST ? [process.env.DEV_PHONE_HOST] : [],
  // Keep browser tests independent of the developer's running server.
  distDir: process.env.GROUPBASKET_E2E === "1" ? ".next/e2e" : ".next",
  turbopack: {
    // OpenCV.js names fs and crypto in a branch only Node runs.
    resolveAlias: {
      fs: { browser: "./src/lib/empty-module.ts" },
      crypto: { browser: "./src/lib/empty-module.ts" },
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    // Up to twelve private partnership images (5 MB each), plus multipart overhead.
    serverActions: { bodySizeLimit: "64mb" },
    // `next upgrade --agent` applies security releases.
    agentUpgrade: "security",
  },
  serverExternalPackages: ["@prisma/client", "pg"],
  poweredByHeader: false,
};

// Source maps upload only when SENTRY_AUTH_TOKEN is set (CI or a release build), then are deleted
// from the build so the browser never receives them.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  widenClientFileUpload: true,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN, deleteSourcemapsAfterUpload: true },
});
