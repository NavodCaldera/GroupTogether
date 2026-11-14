import { describe, expect, it } from "vitest";
import { withinWindow, factoryOverdue, canMoveReturn } from "./return-rules";
describe("return rules", () => {
  const delivered = new Date("2026-11-01T10:00:00Z");
  it("includes exactly 48 hours and excludes later or earlier instants", () => {
    expect(withinWindow(delivered, new Date("2026-11-03T10:00:00Z"))).toBe(true);
    expect(withinWindow(delivered, new Date("2026-11-03T10:01:00Z"))).toBe(false);
    expect(withinWindow(delivered, new Date("2026-11-01T09:59:00Z"))).toBe(false);
  });
  it("uses the stored due instant for factory timeout", () => {
    expect(factoryOverdue(delivered, delivered)).toBe(false);
    expect(factoryOverdue(delivered, new Date(delivered.getTime() + 1))).toBe(true);
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
    ["ACCEPTED", "AWAITING_HANDOVER"],
    ["AWAITING_HANDOVER", "HANDED_OVER"],
    ["AWAITING_HANDOVER", "LAPSED"],
    ["HANDED_OVER", "PICKED_UP"],
    ["WAITING_FACTORY", "AWAITING_HANDOVER"],
    ["WITH_ADMIN", "AWAITING_HANDOVER"],
    ["WITH_ADMIN", "BUYER_REQUESTED"],
    ["BUYER_REQUESTED", "AWAITING_HANDOVER"],
    ["BUYER_REQUESTED", "REJECTED"],
    ["AWAITING_HANDOVER", "WITH_AGENT"],
    ["WITH_AGENT", "SOLD"],
    ["WITH_AGENT", "TAKEN_BACK"],
  ] as const)("allows %s -> %s", (from, to) => expect(canMoveReturn(from, to)).toBe(true));
  it("refuses invalid and terminal moves", () => {
    expect(canMoveReturn("REJECTED", "WITH_ADMIN")).toBe(false);
    expect(canMoveReturn("WAITING_FACTORY", "REJECTED")).toBe(false);
    expect(canMoveReturn("COMPLETED", "WITH_ADMIN")).toBe(false);
    expect(canMoveReturn("WAITING_FACTORY", "COMPLETED")).toBe(false);
    expect(canMoveReturn("ACCEPTED", "ACCEPTED")).toBe(false);
    expect(canMoveReturn("LAPSED", "HANDED_OVER")).toBe(false);
    expect(canMoveReturn("HANDED_OVER", "COMPLETED")).toBe(false);
    // Buyer-fault items never travel to the factory and cannot be re-decided.
    expect(canMoveReturn("WITH_AGENT", "PICKED_UP")).toBe(false);
    expect(canMoveReturn("HANDED_OVER", "WITH_AGENT")).toBe(false);
    expect(canMoveReturn("BUYER_REQUESTED", "WITH_ADMIN")).toBe(false);
    expect(canMoveReturn("SOLD", "TAKEN_BACK")).toBe(false);
    expect(canMoveReturn("WAITING_FACTORY", "BUYER_REQUESTED")).toBe(false);
  });
});
