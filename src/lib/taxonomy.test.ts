import { describe, expect, it } from "vitest";
import { KINDS, ageOn, audienceFor, findKind, kindFits, kindsFor, sizesFor } from "./taxonomy";

describe("taxonomy", () => {
  it("keeps kind ids unique", () => {
    const ids = Object.values(KINDS).flatMap((l) => l.map((x) => x.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("offers only clothing kinds and rejects legacy footwear kinds", () => {
    expect(kindsFor(undefined).some((kind) => String(kind.category) === "SHOES")).toBe(false);
    expect(kindsFor(undefined).every((kind) => kind.category === "APPAREL")).toBe(true);
    expect(findKind("boy-shoes")).toBeUndefined();
    expect(kindFits("BOY", "boy-shoes")).toBe(false);
    expect(sizesFor("boy-shoes")).toEqual([]);
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
    expect(findKind("boy-tshirts")?.category).toBe("APPAREL");
    expect(sizesFor(undefined)).toEqual([]);
  });
});

describe("audienceFor", () => {
  const now = new Date("2026-11-21T10:00:00Z");
  const born = (iso: string) => new Date(`${iso}T00:00:00Z`);

  it("needs both gender and birth date", () => {
    expect(audienceFor(null, born("1990-01-01"), now)).toBeNull();
    expect(audienceFor("MALE", null, now)).toBeNull();
  });

  it("maps adults, juniors and young children", () => {
    expect(audienceFor("MALE", born("1990-05-01"), now)).toBe("MEN");
    expect(audienceFor("FEMALE", born("1990-05-01"), now)).toBe("WOMEN");
    expect(audienceFor("MALE", born("2016-01-01"), now)).toBe("BOY");
    expect(audienceFor("FEMALE", born("2016-01-01"), now)).toBe("GIRL");
    expect(audienceFor("FEMALE", born("2022-01-01"), now)).toBe("KID");
  });

  it("turns 13 on the birthday, not before", () => {
    expect(ageOn(born("2013-11-22"), now)).toBe(12);
    expect(audienceFor("MALE", born("2013-11-22"), now)).toBe("BOY");
    expect(audienceFor("MALE", born("2013-11-21"), now)).toBe("MEN");
  });
});
