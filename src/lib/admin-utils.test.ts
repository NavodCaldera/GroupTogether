import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";
import { colomboDateRange, colomboDayStart, formatIsoDateTime, waitedFor } from "./format";

describe("colomboDateRange", () => {
  it("covers whole Colombo days, both ends included", () => {
    const r = colomboDateRange("2026-10-01", "2026-10-20");
    expect(r.from).toBe("2026-10-01");
    expect(r.to).toBe("2026-10-20");
    expect(r.range?.gte?.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(r.range?.lt?.toISOString()).toBe("2026-10-20T18:30:00.000Z");
  });

  it("swaps a reversed pair and works with one end", () => {
    expect(colomboDateRange("2026-10-20", "2026-10-01").from).toBe("2026-10-01");
    const onlyFrom = colomboDateRange("2026-10-05");
    expect(onlyFrom.range?.gte?.toISOString()).toBe("2026-10-04T18:30:00.000Z");
    expect(onlyFrom.range?.lt).toBeUndefined();
  });

  it("ignores days that don't exist or aren't dates", () => {
    const none = { from: undefined, to: undefined, range: undefined };
    expect(colomboDateRange("2026-02-30", "soon")).toEqual(none);
    expect(colomboDateRange()).toEqual(none);
  });
});

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

describe("waitedFor", () => {
  const now = new Date("2026-10-18T10:00:00Z");
  const ago = (mins: number) => new Date(now.getTime() - mins * 60_000);
  it("reads like a queue age", () => {
    expect(waitedFor(ago(0.5), now)).toBe("just now");
    expect(waitedFor(ago(35), now)).toBe("35m");
    expect(waitedFor(ago(60), now)).toBe("1h");
    expect(waitedFor(ago(125), now)).toBe("2h 5m");
    expect(waitedFor(ago(3 * 24 * 60 + 10), now)).toBe("3d");
  });
});
