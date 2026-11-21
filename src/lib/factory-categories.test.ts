import { describe, expect, it } from "vitest";
import { toTree, type CategoryNode } from "./categories";
import { coveredBy, needsLicence } from "./factory-categories";

const node = (over: Partial<CategoryNode> & { id: string }): CategoryNode => ({
  parentId: null,
  slug: over.id,
  name: over.id,
  path: `/${over.id}/`,
  sortOrder: 0,
  active: true,
  commissionPct: null,
  minCommission: null,
  features: [],
  needsApproval: false,
  returnReasons: [],
  attributes: [],
  ...over,
});

// food (restricted) > tea; clothing > shirts
const tree = toTree([
  node({ id: "food", needsApproval: true }),
  node({ id: "tea", parentId: "food", path: "/food/tea/" }),
  node({ id: "clothing" }),
  node({ id: "shirts", parentId: "clothing", path: "/clothing/shirts/" }),
  node({ id: "clothes" }),
]);

describe("factory category approval", () => {
  it("covers the approved category and its subtree only", () => {
    expect(coveredBy(tree, ["clothing"], "shirts")).toBe(true);
    expect(coveredBy(tree, ["clothing"], "clothing")).toBe(true);
    expect(coveredBy(tree, ["shirts"], "clothing")).toBe(false);
    expect(coveredBy(tree, ["clothing"], "tea")).toBe(false);
    expect(coveredBy(tree, [], "shirts")).toBe(false);
    expect(coveredBy(tree, ["clothing"], "unknown")).toBe(false);
  });

  it("does not treat a shared slug prefix as a subtree", () => {
    expect(coveredBy(tree, ["clothes"], "shirts")).toBe(false);
  });

  it("inherits the licence requirement", () => {
    expect(needsLicence(tree, "tea")).toBe(true);
    expect(needsLicence(tree, "shirts")).toBe(false);
  });
});
