import { describe, expect, it } from "vitest";
import { clashesWith, nearestAgents, openNow, weekEnding, isPickupCode } from "./agent-rules";

// 0.018 degrees of latitude is about 2.0 km.
const origin = { lat: 6.9, lng: 79.86 };
const northM = (m: number) => ({ lat: origin.lat + m / 111195, lng: origin.lng });

describe("clashesWith", () => {
  it("is true under the gap and false over it", () => {
    expect(clashesWith(origin, [northM(1999)], 2000)).toBe(true);
    expect(clashesWith(origin, [northM(2001)], 2000)).toBe(false);
    expect(clashesWith(origin, [], 2000)).toBe(false);
  });
});

describe("nearestAgents", () => {
  const agents = [
    { id: "far", ...northM(5000) },
    { id: "near", ...northM(500) },
  ];
  it("sorts nearest first with km distances", () => {
    const r = nearestAgents(origin, agents);
    expect(r.map((a) => a.id)).toEqual(["near", "far"]);
    expect(r[0].distanceKm).toBeCloseTo(0.5, 1);
  });
  it("keeps the given order with null distance for no buyer pin", () => {
    const r = nearestAgents(null, agents);
    expect(r.map((a) => a.id)).toEqual(["far", "near"]);
    expect(r.every((a) => a.distanceKm === null)).toBe(true);
  });
});

describe("openNow", () => {
  const hours = [{ weekday: 1, opensAt: 540, closesAt: 1020 }];
  it("uses Colombo time, open at open and closed at close", () => {
    expect(openNow(hours, new Date("2026-11-09T16:59:00+05:30"))).toBe(true);
    expect(openNow(hours, new Date("2026-11-09T17:00:00+05:30"))).toBe(false);
    expect(openNow(hours, new Date("2026-11-09T09:00:00+05:30"))).toBe(true);
    expect(openNow(hours, new Date("2026-11-09T08:59:00+05:30"))).toBe(false);
    expect(openNow(hours, new Date("2026-11-10T10:00:00+05:30"))).toBe(false);
  });
  it("rolls the weekday over at Colombo midnight, not UTC", () => {
    // Sunday 23:30 UTC is Monday 05:00 Colombo
    expect(openNow([{ weekday: 1, opensAt: 0, closesAt: 600 }], new Date("2026-11-08T23:30:00Z"))).toBe(true);
  });
});

describe("weekEnding", () => {
  it("returns the last Saturday end", () => {
    expect(weekEnding(new Date("2026-11-08T02:00:00+05:30")).toISOString()).toBe(
      new Date("2026-11-07T23:59:59.999+05:30").toISOString(),
    );
    expect(weekEnding(new Date("2026-11-07T23:59:59+05:30")).toISOString()).toBe(
      new Date("2026-10-31T23:59:59.999+05:30").toISOString(),
    );
  });
  it("returns itself at the exact instant", () => {
    const end = new Date("2026-11-07T23:59:59.999+05:30");
    expect(weekEnding(end).getTime()).toBe(end.getTime());
  });
});

describe("isPickupCode", () => {
  it("needs exactly six digits", () => {
    expect(isPickupCode("123456")).toBe(true);
    expect(isPickupCode("12345")).toBe(false);
    expect(isPickupCode("1234567")).toBe(false);
    expect(isPickupCode("12a456")).toBe(false);
  });
});
