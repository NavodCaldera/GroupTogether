import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  },
  serverExternalPackages: ["@prisma/client", "pg"],
  poweredByHeader: false,
};

export default nextConfig;
