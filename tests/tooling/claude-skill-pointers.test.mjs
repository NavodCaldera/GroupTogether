import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const header = (path) => {
  const fm = readFileSync(path, "utf8").split("---")[1];
  return Object.fromEntries(
    fm
      .split(/\r?\n/)
      .map((line) => line.match(/^(name|description|allowed-tools):\s*(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].trim()]),
  );
};

test("every repository skill has a Claude Code pointer with the same header", () => {
  for (const dir of readdirSync(".agents/skills")) {
    const pointer = `.claude/skills/${dir}/SKILL.md`;
    assert.ok(existsSync(pointer), `missing Claude Code pointer for ${dir}`);
    assert.deepEqual(header(pointer), header(`.agents/skills/${dir}/SKILL.md`), dir);
    assert.match(readFileSync(pointer, "utf8"), new RegExp(`\.agents/skills/${dir}/SKILL\.md`));
  }
});
