import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vitest/config";

// `--mode phone` serves over HTTPS on the network: phone cameras need a secure page.
export default defineConfig(({ mode }) => ({
  plugins: mode === "phone" ? [basicSsl()] : [],
  server: { port: 5180 },
  build: { target: "es2022", chunkSizeWarningLimit: 16000 },
  test: { include: ["tests/**/*.test.ts"] },
}));
