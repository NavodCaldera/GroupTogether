import { describe, expect, it } from "vitest";
import { type CategoryNode, resolveAttributes, toTree } from "./categories";
import { SpecsError, parseSpecs, specFilterValue, specText } from "./product-specs";

type Attr = CategoryNode["attributes"][number];
const attr = (key: string, over: Partial<Attr> = {}): Attr => ({
  key,
  label: key[0].toUpperCase() + key.slice(1),
  type: "TEXT",
  unit: null,
  options: [],
  required: false,
  isVariantAxis: false,
  filterable: false,
  sortOrder: 0,
  ...over,
});
const node = (id: string, parentId: string | null, attributes: Attr[]): CategoryNode => ({
  id,
  parentId,
  slug: id,
  name: id,
  path: parentId ? `/${parentId}/${id}/` : `/${id}/`,
  sortOrder: 0,
  active: true,
  commissionPct: null,
  minCommission: null,
  features: [],
  needsApproval: false,
  returnReasons: [],
  attributes,
});

const tree = toTree([
  node("stationery", null, [attr("pages", { type: "NUMBER", unit: "pages", required: true })]),
  node("books", "stationery", [
    attr("ruling", {
      type: "ENUM",
      options: [
        { value: "single", label: "Single ruled" },
        { value: "square", label: "Square" },
      ],
    }),
    attr("hardcover", { type: "BOOL" }),
    attr("colour", { isVariantAxis: true }),
    attr("brand_line"),
  ]),
]);
const books = resolveAttributes(tree, "books");

describe("parseSpecs", () => {
  it("checks values against inherited attributes and types them", () => {
    expect(
      parseSpecs(books, {
        pages: "80",
        ruling: "single",
        hardcover: "true",
        brand_line: " Atlas ",
      }),
    ).toEqual({ pages: 80, ruling: "single", hardcover: true, brand_line: "Atlas" });
  });

  it("needs required values and known choices", () => {
    expect(() => parseSpecs(books, {})).toThrow(SpecsError);
    expect(() => parseSpecs(books, { pages: "eighty" })).toThrow("Pages");
    expect(() => parseSpecs(books, { pages: "80", ruling: "dots" })).toThrow(SpecsError);
  });

  it("leaves out blanks, variant axes and unknown keys; a clear box is false", () => {
    expect(parseSpecs(books, { pages: "80", ruling: "", colour: "Red", other: "x" })).toEqual({
      pages: 80,
      hardcover: false,
    });
  });

  it("keeps stored keys the category no longer has", () => {
    expect(parseSpecs(books, { pages: "96" }, { pages: 80, old_key: "kept" })).toEqual({
      pages: 96,
      hardcover: false,
      old_key: "kept",
    });
  });
});

describe("spec filters and text", () => {
  const [pages, ruling, hardcover] = books;
  it("types shop filter values", () => {
    expect(specFilterValue(pages, "80")).toBe(80);
    expect(specFilterValue(pages, "x")).toBeUndefined();
    expect(specFilterValue(hardcover, "true")).toBe(true);
    expect(specFilterValue(ruling, "single")).toBe("single");
    expect(specFilterValue(ruling, " ")).toBeUndefined();
  });
  it("shows values with units and labels", () => {
    expect(specText(pages, 80)).toBe("80 pages");
    expect(specText(ruling, "single")).toBe("Single ruled");
    expect(specText(hardcover, false)).toBe("No");
  });
});
