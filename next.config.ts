import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  async headers() {
    const production = process.env.NODE_ENV === "production";
    const development = process.env.NODE_ENV === "development";
    const csp = [
      "default-src 'self'",
      // Next's inline bootstrap needs unsafe-inline without nonces; nonces require a proxy.
      `script-src 'self' 'unsafe-inline' https://unpkg.com${development ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline' https://unpkg.com",
      "img-src 'self' data: blob: https://tile.openstreetmap.org https://unpkg.com",
      "font-src 'self'",
      `connect-src 'self' https://photon.komoot.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io${development ? " ws:" : ""}`,
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
        // Config headers override route responses in this Next version; preserve private sandbox CSPs.
        source: "/:path((?!api/(?:slips|partner-docs)(?:/|$)).*)",
        headers: [{ key: "Content-Security-Policy", value: csp }],
      },
    ];
  },
  // Keep browser tests independent of the developer's running server.
  distDir: process.env.GROUPBASKET_E2E === "1" ? ".next/e2e" : ".next",
  turbopack: {
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
