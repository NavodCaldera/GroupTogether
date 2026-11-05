import { describe, expect, it } from "vitest";
import { withinWindow, factoryOverdue, canMoveReturn } from "./return-rules";
describe("return rules", () => {
  const delivered = new Date("2026-11-01T10:00:00Z");
  it("includes exactly 48 hours and excludes later or earlier instants", () => {
    expect(withinWindow(delivered, new Date("2026-11-03T10:00:00Z"))).toBe(true);
    expect(withinWindow(delivered, new Date("2026-11-03T10:01:00Z"))).toBe(false);
    expect(withinWindow(delivered, new Date("2026-11-01T09:59:00Z"))).toBe(false);
  });
  it("requires more than 48 hours for factory timeout", () => {
    expect(factoryOverdue(delivered, new Date("2026-11-03T10:00:00Z"))).toBe(false);
    expect(factoryOverdue(delivered, new Date("2026-11-03T10:01:00Z"))).toBe(true);
  });
  it.each([
    ["WAITING_FACTORY", "ACCEPTED"],
    ["WAITING_FACTORY", "WITH_ADMIN"],
    ["WITH_ADMIN", "ACCEPTED"],
    ["WITH_ADMIN", "REJECTED"],
    ["ACCEPTED", "PICKED_UP"],
    ["ACCEPTED", "RECEIVED"],
    ["PICKED_UP", "RECEIVED"],
    ["RECEIVED", "COMPLETED"],
    ["ACCEPTED", "WITH_ADMIN"],
    ["PICKED_UP", "WITH_ADMIN"],
  ] as const)("allows %s -> %s", (from, to) => expect(canMoveReturn(from, to)).toBe(true));
  it("refuses invalid and terminal moves", () => {
    expect(canMoveReturn("REJECTED", "WITH_ADMIN")).toBe(false);
    expect(canMoveReturn("WAITING_FACTORY", "REJECTED")).toBe(false);
    expect(canMoveReturn("COMPLETED", "WITH_ADMIN")).toBe(false);
    expect(canMoveReturn("WAITING_FACTORY", "COMPLETED")).toBe(false);
    expect(canMoveReturn("ACCEPTED", "ACCEPTED")).toBe(false);
  });
});
