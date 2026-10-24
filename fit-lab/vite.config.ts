import { createReadStream, existsSync } from "node:fs";
import { join, normalize } from "node:path";
import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/**
 * In dev, Vite refuses to serve public/ files that are dynamically imported as
 * modules, which is how MediaPipe loads its runtime inside the vision worker.
 * Serve those files directly; builds copy them from public/ as usual.
 */
function mediapipeRuntime(): Plugin {
  const dir = join(import.meta.dirname, "public/mediapipe");
  const types: Record<string, string> = { ".js": "text/javascript", ".wasm": "application/wasm" };
  return {
    name: "mediapipe-runtime",
    configureServer(server) {
      server.middlewares.use("/mediapipe", (req, res, next) => {
        const name = normalize((req.url ?? "").split("?")[0]).replace(/^[/\\]+/, "");
        const file = join(dir, name);
        const type = types[name.slice(name.lastIndexOf("."))];
        if (!type || !file.startsWith(dir) || !existsSync(file)) return next();
        res.setHeader("Content-Type", type);
        createReadStream(file).pipe(res);
      });
    },
  };
}

// `--mode phone` serves over HTTPS on the network: phone cameras need a secure page.
export default defineConfig(({ mode }) => ({
  plugins: [mediapipeRuntime(), react(), ...(mode === "phone" ? [basicSsl()] : [])],
  server: { port: 5180 },
  // ES module workers, so the vision worker can lazy-load OpenCV.js.
  worker: { format: "es" },
  build: { target: "es2022", chunkSizeWarningLimit: 16000 },
  test: { include: ["tests/**/*.test.ts"] },
}));
