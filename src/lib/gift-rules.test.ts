import { describe, expect, it } from "vitest";
import { nextSettlementSunday } from "./gift-rules";

describe("Sunday settlement calendar", () => {
  it("uses Colombo's day at the Saturday/Sunday boundary", () => {
    expect(nextSettlementSunday(new Date("2026-10-24T18:29:00Z")).toISOString().slice(0, 10)).toBe(
      "2026-10-25",
    );
    expect(nextSettlementSunday(new Date("2026-10-24T18:30:00Z")).toISOString().slice(0, 10)).toBe(
      "2026-10-25",
    );
    expect(nextSettlementSunday(new Date("2026-10-25T18:30:00Z")).toISOString().slice(0, 10)).toBe(
      "2026-11-01",
    );
  });
});
