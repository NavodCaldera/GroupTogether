import { describe, expect, it } from "vitest";
import { inSriLanka, locationSchema } from "./location";

const ok = { address: "27 Ward Place", city: "Colombo 07", lat: "6.91", lng: "79.86" };

describe("locationSchema", () => {
  it("accepts an address with a pin in Sri Lanka", () => {
    expect(locationSchema.parse(ok)).toMatchObject({ lat: 6.91, lng: 79.86 });
  });
  it("requires the pin", () => {
    expect(locationSchema.safeParse({ ...ok, lat: "", lng: "" }).success).toBe(false);
    expect(locationSchema.safeParse({ ...ok, lat: "abc" }).success).toBe(false);
  });
  it("rejects a pin outside Sri Lanka", () => {
    expect(locationSchema.safeParse({ ...ok, lat: "51.5", lng: "-0.12" }).success).toBe(false);
    expect(inSriLanka(7.29, 80.63)).toBe(true);
  });
  it("requires an address and city", () => {
    expect(locationSchema.safeParse({ ...ok, address: "x" }).success).toBe(false);
    expect(locationSchema.safeParse({ ...ok, city: "" }).success).toBe(false);
  });
});
