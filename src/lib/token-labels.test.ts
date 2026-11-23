import { describe, expect, it } from "vitest";
import { formatTime, groupByDay } from "./token-labels";

describe("token history days", () => {
  // 2026-11-21 10:00 in Colombo (04:30 UTC).
  const now = new Date("2026-11-21T04:30:00Z");

  it("group by Colombo day under Today, Yesterday, a date, and a dated year", () => {
    const at = (iso: string) => ({ createdAt: new Date(iso) });
    const groups = groupByDay(
      [
        at("2026-11-21T03:00:00Z"),
        at("2026-11-20T19:00:00Z"), // 00:30 on the 21st in Colombo
        at("2026-11-20T10:00:00Z"),
        at("2026-10-21T10:00:00Z"),
        at("2025-12-31T10:00:00Z"),
      ],
      now,
    );
    expect(groups.map((g) => [g.label, g.entries.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      ["21 Oct", 1],
      ["31 Dec 2025", 1],
    ]);
  });

  it("show the time in Colombo", () => {
    expect(formatTime(new Date("2026-11-21T04:30:00Z"))).toBe("10:00");
  });
});
