import { describe, expect, it } from "vitest";
import { distanceKm, formatDistance, sortNearest } from "./distance";

const colombo = { lat: 6.9271, lng: 79.8612 };
const kandy = { lat: 7.2906, lng: 80.6337 };

describe("distance", () => {
  it("measures Colombo to Kandy at about 94 km", () => {
    expect(distanceKm(colombo, kandy)).toBeGreaterThan(90);
    expect(distanceKm(colombo, kandy)).toBeLessThan(100);
    expect(distanceKm(colombo, colombo)).toBe(0);
  });
  it("formats short and long distances", () => {
    expect(formatDistance(0.8)).toBe("800 m away");
    expect(formatDistance(3.24)).toBe("3.2 km away");
    expect(formatDistance(41.6)).toBe("42 km away");
  });
  it("sorts nearest first with unknown pins last, stable", () => {
    const rows = [
      { id: "a", distanceKm: null },
      { id: "b", distanceKm: 9 },
      { id: "c", distanceKm: 2 },
      { id: "d", distanceKm: null },
    ];
    expect(sortNearest(rows).map((r) => r.id)).toEqual(["c", "b", "a", "d"]);
  });
});
