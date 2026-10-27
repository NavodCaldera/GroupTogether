import type { NextConfig } from "next";

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
    // A bank slip or product photo of up to 5 MB, plus multipart overhead.
    serverActions: { bodySizeLimit: "8mb" },
    // `next upgrade --agent` applies security releases.
    agentUpgrade: "security",
  },
  serverExternalPackages: ["@prisma/client", "pg"],
  poweredByHeader: false,
};

export default nextConfig;
