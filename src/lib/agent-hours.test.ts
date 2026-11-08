import { describe, expect, it } from "vitest";
import { formatHours, mapLink } from "./agent-hours";

describe("formatHours", () => {
  it("joins consecutive days with the same times", () => {
    const week = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, opensAt: 540, closesAt: 1080 }));
    expect(formatHours([...week, { weekday: 6, opensAt: 540, closesAt: 780 }])).toBe(
      "Mon–Fri 09:00–18:00 · Sat 09:00–13:00",
    );
  });
  it("keeps a gap between days apart", () => {
    expect(
      formatHours([
        { weekday: 3, opensAt: 600, closesAt: 630 },
        { weekday: 1, opensAt: 600, closesAt: 630 },
      ]),
    ).toBe("Mon 10:00–10:30 · Wed 10:00–10:30");
  });
  it("is empty with no hours", () => expect(formatHours([])).toBe(""));
});

it("links a map pin", () =>
  expect(mapLink({ lat: 6.9115, lng: 79.8505 })).toBe("https://maps.google.com/?q=6.9115,79.8505"));
