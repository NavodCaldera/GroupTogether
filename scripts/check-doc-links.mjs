import fs from "node:fs";
import path from "node:path";

const files = ["AGENTS.md", "CLAUDE.md", "README.md"];
for (const directory of ["docs", ".claude/agents"])
  for (const name of fs.readdirSync(directory))
    if (name.endsWith(".md")) files.push(path.join(directory, name));
const missing = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, "").split("#", 1)[0];
    if (!target || target.includes(":") || target.startsWith("/")) continue;
    if (!fs.existsSync(path.resolve(path.dirname(file), decodeURIComponent(target))))
      missing.push(`${file}: ${target}`);
  }
}
if (missing.length) {
  console.error(missing.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Local file links passed in ${files.length} repository documents (anchors/external URLs not checked).`,
  );
