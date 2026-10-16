import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";
import { colomboDayStart, formatIsoDateTime } from "./format";

describe("colomboDayStart", () => {
  it("is midnight in Colombo (18:30 UTC the day before)", () => {
    const now = new Date("2026-10-16T10:00:00Z"); // 15:30 in Colombo
    expect(colomboDayStart(now).toISOString()).toBe("2026-10-15T18:30:00.000Z");
  });

  it("rolls over at Colombo midnight, not UTC midnight", () => {
    const late = new Date("2026-10-16T18:45:00Z"); // 00:15 on the 17th in Colombo
    expect(colomboDayStart(late).toISOString()).toBe("2026-10-16T18:30:00.000Z");
  });

  it("goes back whole days", () => {
    const now = new Date("2026-10-16T10:00:00Z");
    expect(colomboDayStart(now, 6).toISOString()).toBe("2026-10-09T18:30:00.000Z");
  });
});

describe("formatIsoDateTime", () => {
  it("shows Colombo time", () => {
    expect(formatIsoDateTime(new Date("2026-10-16T10:00:00Z"))).toBe("2026-10-16 15:30");
    expect(formatIsoDateTime(null)).toBe("");
  });
});

describe("toCsv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(toCsv([["a", 'say "hi"', "x,y", "two\nlines", null, 5]])).toBe(
      'a,"say ""hi""","x,y","two\nlines",,5\r\n',
    );
  });

  it("defuses text that a spreadsheet would run as a formula", () => {
    expect(toCsv([["=HYPERLINK(1)", "+94", "@x", "-1"]])).toBe("'=HYPERLINK(1),'+94,'@x,'-1\r\n");
  });

  it("leaves numbers alone", () => {
    expect(toCsv([[-5, 50000]])).toBe("-5,50000\r\n");
  });
});
