/** Reads the material library seed files in `seeds/` (DEC-022). Node only: loader and tests. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLibrary, type LibrarySeed } from "./seed";

const json = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

export function readLibrary(dir = join(process.cwd(), "seeds")): LibrarySeed {
  const matDir = join(dir, "materials");
  return parseLibrary({
    sources: json(join(dir, "sources.json")),
    evidence: json(join(dir, "evidence.json")),
    taxonomy: json(join(dir, "taxonomy.json")),
    labs: json(join(dir, "labs.json")),
    materials: readdirSync(matDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => json(join(matDir, f))),
  });
}
