import { describe, expect, it } from "vitest";
import { z } from "zod";
import { inSriLanka, pinFields, pinInSriLanka, pinOutsideMessage } from "./location";

const pin = z.object(pinFields).refine(pinInSriLanka, pinOutsideMessage);

describe("map pin", () => {
  it("accepts a pin in Sri Lanka", () => {
    expect(pin.parse({ lat: "6.91", lng: "79.86" })).toEqual({ lat: 6.91, lng: 79.86 });
    expect(inSriLanka(7.29, 80.63)).toBe(true);
  });
  it("requires the pin", () => {
    expect(pin.safeParse({ lat: "", lng: "" }).success).toBe(false);
    expect(pin.safeParse({ lat: "abc", lng: "79.86" }).success).toBe(false);
  });
  it("rejects a pin outside Sri Lanka", () => {
    expect(pin.safeParse({ lat: "51.5", lng: "-0.12" }).success).toBe(false);
  });
});
