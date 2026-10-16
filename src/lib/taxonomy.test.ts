import { describe, expect, it } from "vitest";
import { KINDS, findKind, kindFits, kindsFor, sizesFor } from "./taxonomy";

describe("taxonomy", () => {
  it("keeps kind ids unique", () => {
    const ids = Object.values(KINDS).flatMap((l) => l.map((x) => x.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("changes categories with the audience", () => {
    expect(kindsFor("MEN").map((x) => x.label)).toContain("Trousers");
    expect(kindsFor("WOMEN").map((x) => x.label)).toContain("Dresses");
    expect(kindFits("MEN", "women-dresses")).toBe(false);
  });
  it("changes sizes with the category", () => {
    expect(sizesFor("men-trousers")).toContain("32");
    expect(sizesFor("men-tshirts")).toContain("XL");
    expect(sizesFor("kid-tops")).toContain("2-3Y");
    expect(findKind("boy-shoes")?.category).toBe("SHOES");
    expect(sizesFor(undefined)).toEqual([]);
  });
});
