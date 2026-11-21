import { describe, expect, it } from "vitest";
import {
  cleanOptions,
  optionAxes,
  optionKeyOf,
  optionName,
  optionsFromSizeColour,
  parseOptions,
  readOptions,
  variantFields,
  variantLabel,
  VariantOptionsError,
} from "./variant-options";

describe("optionKeyOf", () => {
  it("sorts keys and lower-cases trimmed values", () => {
    expect(optionKeyOf({ size: " M ", colour: "Navy" })).toBe("colour=navy|size=m");
    expect(optionKeyOf({ ruling: "Single", pages: "120" })).toBe("pages=120|ruling=single");
  });
  it("is empty with no options and skips empty values", () => {
    expect(optionKeyOf({})).toBe("");
    expect(optionKeyOf({ size: "L", colour: " " })).toBe("size=l");
  });
  it("does not depend on key order", () => {
    expect(optionKeyOf({ a: "1", b: "2" })).toBe(optionKeyOf({ b: "2", a: "1" }));
  });
});

describe("variantLabel", () => {
  it("puts size then colour, then other names alphabetically", () => {
    expect(variantLabel({ colour: "Navy", size: "M" })).toBe("M / Navy");
    expect(variantLabel({ ruling: "single", pages: "120" })).toBe("120 / single");
    expect(variantLabel({ flavour: "Lime", size: "1L" })).toBe("1L / Lime");
  });
  it("is empty with no options", () => {
    expect(variantLabel({})).toBe("");
  });
});

describe("cleanOptions and parseOptions", () => {
  it("lower-cases names, trims values and leaves out empty ones", () => {
    expect(cleanOptions({ Size: " M ", colour: "", pages: null })).toEqual({ size: "M" });
  });
  it("refuses bad names, | or = in values and repeated names", () => {
    expect(() => cleanOptions({ "bad key": "x" })).toThrow(VariantOptionsError);
    expect(() => cleanOptions({ size: "M|L" })).toThrow(VariantOptionsError);
    expect(() => cleanOptions({ size: "a=b" })).toThrow(VariantOptionsError);
    expect(() => cleanOptions({ Size: "M", size: "L" })).toThrow(VariantOptionsError);
  });
  it("returns a message instead of throwing", () => {
    expect(parseOptions({ size: "M" })).toEqual({ ok: true, options: { size: "M" } });
    expect(parseOptions("x")).toEqual({ ok: false, error: "Enter the options" });
    expect(parseOptions({ size: "M|L" }).ok).toBe(false);
  });
});

describe("readOptions", () => {
  it("keeps string values and drops anything else", () => {
    expect(readOptions({ size: "M", n: 3, colour: " " })).toEqual({ size: "M" });
    expect(readOptions(null)).toEqual({});
    expect(readOptions(["M"])).toEqual({});
  });
});

describe("variantFields", () => {
  it("matches the migration backfill for size and colour", () => {
    expect(variantFields(optionsFromSizeColour("M", "Navy"))).toEqual({
      options: { size: "M", colour: "Navy" },
      optionKey: "colour=navy|size=m",
      label: "M / Navy",
    });
    expect(variantFields(optionsFromSizeColour("XL"))).toMatchObject({
      options: { size: "XL" },
      optionKey: "size=xl",
      label: "XL",
    });
  });
  it("builds a label for products without a size", () => {
    expect(variantFields({ pages: "80" })).toEqual({
      options: { pages: "80" },
      optionKey: "pages=80",
      label: "80",
    });
  });
});

describe("optionAxes", () => {
  it("groups values by option name, sizes small to large", () => {
    const axes = optionAxes([
      { options: { size: "XL", colour: "Navy" } },
      { options: { size: "S", colour: "Black" } },
      { options: { size: "M", colour: "Navy" } },
    ]);
    expect(axes).toEqual([
      { key: "size", values: ["S", "M", "XL"] },
      { key: "colour", values: ["Black", "Navy"] },
    ]);
  });
  it("uses the category's size order when given and sorts numbers naturally", () => {
    expect(
      optionAxes([{ options: { size: "4-5Y" } }, { options: { size: "2-3Y" } }], ["2-3Y", "4-5Y"]),
    ).toEqual([{ key: "size", values: ["2-3Y", "4-5Y"] }]);
    expect(optionAxes([{ options: { pages: "120" } }, { options: { pages: "80" } }])).toEqual([
      { key: "pages", values: ["80", "120"] },
    ]);
  });
});

describe("optionName", () => {
  it("turns a name into a heading", () => {
    expect(optionName("size")).toBe("Size");
    expect(optionName("volume_ml")).toBe("Volume ml");
  });
});
