import { describe, expect, it } from "vitest";
import { canFactory, editsListings, factoryOf, factorySections, seesMoney } from "./factory-roles";

describe("factory roles", () => {
  it("gives owners every section and staff only their own", () => {
    expect(factorySections("OWNER")).toContain("team");
    expect(canFactory("PACKING", "orders")).toBe(true);
    expect(canFactory("PACKING", "products")).toBe(false);
    expect(canFactory("SALES", "orders")).toBe(false);
    expect(canFactory("PLANNER", "team")).toBe(false);
  });

  it("shows money to owners only", () => {
    expect(seesMoney("OWNER")).toBe(true);
    expect(["PACKING", "PLANNER", "SALES"].map((r) => seesMoney(r as never))).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("lets packing staff leave listings alone", () => {
    expect(editsListings("PACKING")).toBe(false);
    expect(editsListings("SALES")).toBe(true);
  });

  it("treats the factory account as its own owner and staff as working for it", () => {
    expect(factoryOf({ id: "f", factoryId: null, factoryRole: null })).toEqual({
      factoryId: "f",
      factoryRole: "OWNER",
    });
    expect(factoryOf({ id: "s", factoryId: "f", factoryRole: "SALES" })).toEqual({
      factoryId: "f",
      factoryRole: "SALES",
    });
  });
});
