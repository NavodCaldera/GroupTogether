import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
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
