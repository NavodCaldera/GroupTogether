// Lets the seed load server modules outside Next.js: "server-only" resolves to its no-op build,
// as Next.js does for server code (tests alias it the same way in vitest.config.ts).
import { registerHooks } from "node:module";

const empty = new URL("../node_modules/server-only/empty.js", import.meta.url).href;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: empty, format: "commonjs", shortCircuit: true };
    return next(specifier, context);
  },
});
