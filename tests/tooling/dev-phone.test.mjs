import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("dev:phone serves HTTPS on the local network", () => {
  const script = JSON.parse(readFileSync("package.json", "utf8")).scripts["dev:phone"] ?? "";
  assert.match(script, /--experimental-https/);
  assert.match(script, /-H 0\.0\.0\.0/);
});

test("next.config allows the phone's origin from DEV_PHONE_HOST", () => {
  const config = readFileSync("next.config.ts", "utf8");
  assert.match(config, /allowedDevOrigins/);
  assert.match(config, /DEV_PHONE_HOST/);
});
