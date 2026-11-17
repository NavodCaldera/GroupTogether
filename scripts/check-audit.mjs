// `npm audit --audit-level=high`, except for advisories listed below that have no fixed release.
// Each entry needs a reason and a review date; after that date it fails again so it is looked at.
import { execFileSync } from "node:child_process";

const ALLOWED = {
  // picomatch ReDoS: every version (<= 4.0.7) is affected and no fix is published. It reaches us
  // only through build and test tools (Sentry's build plugin, vite/vitest, eslint), which match
  // our own fixed glob patterns, never user input.
  "GHSA-fc5q-39xc-vjpf": { until: "2026-12-31" },
};

let raw;
try {
  raw = execFileSync("npm", ["audit", "--json"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
} catch (e) {
  raw = e.stdout; // npm audit exits non-zero when it finds anything
}
const report = JSON.parse(raw);
const today = new Date().toISOString().slice(0, 10);
const bad = new Map();
const allowed = new Set();

for (const v of Object.values(report.vulnerabilities ?? {})) {
  for (const via of v.via) {
    if (typeof via !== "object" || !["high", "critical"].includes(via.severity)) continue;
    const id = via.url?.split("/").pop() ?? via.title;
    if (ALLOWED[id] && today <= ALLOWED[id].until) allowed.add(id);
    else bad.set(id, `${via.severity} ${via.name}: ${via.title} (${via.url})`);
  }
}

for (const id of allowed) console.log(`allowed until ${ALLOWED[id].until}: ${id}`);
if (bad.size) {
  for (const line of bad.values()) console.error(line);
  process.exit(1);
}
console.log("No high or critical advisories outside the allowlist.");
