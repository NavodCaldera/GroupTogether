import { describe, expect, it } from "vitest";
import { buildCard, isSourced, sourcedFields } from "./card";
import { computeProfile } from "./profile";
import { checkLibrary, libraryFacts } from "./seed";
import { readLibrary } from "./seed-files";

const lib = readLibrary();

describe("material library seed files", () => {
  it("have no unsourced values", () => {
    expect(checkLibrary(lib)).toEqual([]);
  });

  it("catch an unsourced number", () => {
    const bad = structuredClone(lib);
    bad.materials[0].gsm = [1, 999];
    bad.taxonomy.fibers[0].moistureRegainPct = 42;
    bad.materials[1].evidence[0].source = "NOPE";
    const problems = checkLibrary(bad).join("\n");
    expect(problems).toMatch(/gsm range has no matching verified evidence/);
    expect(problems).toMatch(/moistureRegainPct has no matching verified evidence/);
    expect(problems).toMatch(/unknown source NOPE/);
  });

  it("hold 33 materials", () => {
    expect(lib.materials).toHaveLength(33);
  });

  it.each(lib.materials.map((m) => m.code))("card for %s shows only sourced values", (code) => {
    const m = lib.materials.find((x) => x.code === code)!;
    const gsm = m.gsm ? Math.round((m.gsm[0] + m.gsm[1]) / 2) : 150;
    const facts = libraryFacts(lib, code, gsm);
    const card = buildCard(
      {
        ...facts,
        productMaterialId: "pm",
        displayName: m.displayName,
        constructionName: m.construction,
        yarnProcessName: m.yarnProcess,
        feelsLikeAnchor: m.feelsLikeAnchor,
        composition: facts.fibers,
        fiberNames: {},
        standardNames: {},
        actualGsm: gsm,
        careNotes: null,
        videoUrl: null,
        axes: computeProfile(facts),
      },
      { declaredComposition: true },
    );
    const bad = sourcedFields(card).filter((f) => f.shown && !isSourced(f.provenance));
    expect(bad).toEqual([]);
  });
});
