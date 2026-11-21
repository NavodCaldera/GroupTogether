import { describe, expect, it } from "vitest";
import { parseItems } from "./cart-items";

describe("parseItems", () => {
  it("splits comma-separated ids, dropping blanks, repeats and bad ids", () => {
    expect(parseItems("a1, b_2,,a1,bad id,c-3")).toEqual(["a1", "b_2", "c-3"]);
  });
  it("takes an array of form values", () => {
    expect(parseItems(["x", "y,z"])).toEqual(["x", "y", "z"]);
  });
  it("is empty, not the whole cart, when only bad ids are given", () => {
    expect(parseItems("bad id")).toEqual([]);
  });
  it("is undefined when nothing is given", () => {
    expect(parseItems("")).toBeUndefined();
    expect(parseItems(undefined)).toBeUndefined();
  });
});
