import { describe, expect, it } from "vitest";
import { endsAtFor, sellingAllowed, reminderDue } from "./agreement-rules";
const now = new Date("2026-12-01T00:00:00Z");
const end = new Date("2027-12-01T00:00:00Z");
const active = {
  status: "ACTIVE" as const,
  complianceDueAt: null,
  acceptance: { versionId: "v1", endsAt: end },
  latestVersionId: "v1",
};
describe("agreement rules", () => {
  it("uses 12 calendar months and clamps leap-day anniversaries", () => {
    expect(endsAtFor(now)).toEqual(end);
    expect(endsAtFor(new Date("2028-02-29T12:34:56Z"))).toEqual(new Date("2029-02-28T12:34:56Z"));
    // February 29 at 00:30 in Colombo is still February 28 in UTC.
    expect(endsAtFor(new Date("2028-02-28T19:00:00Z"))).toEqual(new Date("2029-02-27T19:00:00Z"));
    expect(now.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
  it("requires active, current and unexpired acceptance", () => {
    expect(sellingAllowed(active, now)).toBe(true);
    expect(sellingAllowed({ ...active, status: "REMOVED" }, now)).toBe(false);
    expect(sellingAllowed({ ...active, latestVersionId: "v2" }, now)).toBe(false);
    expect(sellingAllowed(active, new Date("2027-12-02"))).toBe(false);
    expect(sellingAllowed(active, end)).toBe(false);
    expect(sellingAllowed({ ...active, latestVersionId: null }, now)).toBe(false);
    expect(sellingAllowed({ ...active, acceptance: null }, now)).toBe(false);
  });
  it("honours legacy grace only without an existing acceptance", () => {
    const legacy = { ...active, acceptance: null, complianceDueAt: new Date("2026-12-31") };
    expect(sellingAllowed(legacy, now)).toBe(true);
    expect(sellingAllowed(legacy, new Date("2027-01-01"))).toBe(false);
    expect(sellingAllowed(legacy, legacy.complianceDueAt)).toBe(false);
    expect(
      sellingAllowed(
        { ...active, complianceDueAt: legacy.complianceDueAt, latestVersionId: "v2" },
        now,
      ),
    ).toBe(false);
  });
  it("reminds at 30 days, not 31 or twice or after expiry", () => {
    expect(reminderDue(new Date(now.getTime() + 30 * 86400000), null, now)).toBe(true);
    expect(reminderDue(new Date(now.getTime() + 31 * 86400000), null, now)).toBe(false);
    expect(reminderDue(new Date(now.getTime() + 30 * 86400000), now, now)).toBe(false);
    expect(reminderDue(now, null, now)).toBe(false);
  });
});
