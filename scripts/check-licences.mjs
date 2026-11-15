import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Body models and reconstruction methods that are research-only or non-commercial (DEC-021):
// SMPL, SMPL-X, SMPLify, STAR, SUPR, PIFuHD, ECON, ICON. Anny is allowed, but its SMPL
// converters download NAVER's non-commercial data, so those names are blocked too.
const ANYWHERE = [
  [/smpl/i, "SMPL-family model or converter (non-commercial)"],
  [/pifuhd/i, "PIFuHD (non-commercial)"],
  [/noncommercial/i, "non-commercial data download"],
  [/\bsupr\b/i, "SUPR body model (non-commercial)"],
];
// Short names that are ordinary words elsewhere: only blocked as Python imports or packages.
const PY_IMPORT = /^\s*(?:from|import)\s+(econ|icon|star|supr)\b/i;
const PY_PACKAGE = /^\s*(econ|icon|star|supr|star-model|pifuhd)\s*([=<>!~[;#]|$)/i;

const ROOTS = ["src", "scripts", "tools", "prisma", "package.json"];
const SKIP_DIRS = new Set(["node_modules", "__pycache__", "generated", ".venv", "venv", "out"]);
const EXT = /\.(py|ts|tsx|mjs|js|json|txt|toml|cfg|prisma)$/;
const SELF = "scripts/check-licences.mjs";

/** Failures for one file's path and text. */
export function checkLicences(file, text) {
  const failures = [];
  for (const [pattern, why] of ANYWHERE)
    if (pattern.test(file)) failures.push(`${file}: file name: ${why}`);
  text.split(/\r?\n/).forEach((line, i) => {
    const at = `${file}:${i + 1}`;
    for (const [pattern, why] of ANYWHERE) if (pattern.test(line)) failures.push(`${at}: ${why}`);
    if (file.endsWith(".py") && PY_IMPORT.test(line))
      failures.push(`${at}: import of a non-commercial body model`);
    if (/requirements[^/]*\.txt$/.test(file) && PY_PACKAGE.test(line))
      failures.push(`${at}: non-commercial body model package`);
  });
  return failures;
}

function walk(entry, out) {
  if (!fs.existsSync(entry)) return out;
  if (fs.statSync(entry).isDirectory()) {
    for (const name of fs.readdirSync(entry)) {
      if (!SKIP_DIRS.has(name)) walk(path.join(entry, name), out);
    }
  } else if (EXT.test(entry)) out.push(entry.replaceAll("\\", "/"));
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = ROOTS.flatMap((root) => walk(root, [])).filter((file) => file !== SELF);
  const failures = files.flatMap((file) => checkLicences(file, fs.readFileSync(file, "utf8")));
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  } else
    console.log(`Licence check passed (${files.length} files): no non-commercial body models.`);
}
