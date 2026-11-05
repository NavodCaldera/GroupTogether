import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent, scrubText } from "./sentry-scrub";

describe("scrubText", () => {
  it("removes NIC numbers in old and new formats", () => {
    expect(scrubText("NIC 912345678V and 199123456789")).toBe("NIC [nic] and [nic]");
  });
  it("removes bank account and phone digit runs", () => {
    expect(scrubText("acct 0012-3456-7890 / 8001234567")).toBe("acct [number] / [number]");
  });
  it("removes emails and long tokens", () => {
    expect(scrubText("a@b.lk partner_Ab3dEf9hIjKlMnOpQrStUvWxYz0123456789-_abcd")).toBe(
      "[email] [token]",
    );
  });
  it("removes secret path segments", () => {
    expect(scrubText("/factories/sign-in/abc?x=1")).toBe("/factories/sign-in/[redacted]");
    expect(scrubText("https://x.lk/factories/apply/inv123")).toBe(
      "https://x.lk/factories/apply/[redacted]",
    );
    expect(scrubText("/c/K7Q2/join")).toBe("/c/[redacted]/join");
    expect(scrubText("/api/partner-docs/42")).toBe("/api/partner-docs/[redacted]");
  });
  it("keeps ordinary text", () => {
    expect(scrubText("Cart total failed for size M")).toBe("Cart total failed for size M");
  });
});

describe("scrubEvent", () => {
  it("drops request bodies, cookies, headers, query, extras and user details", () => {
    const event = scrubEvent({
      message: "NIC 912345678V",
      user: { id: "u1", email: "a@b.lk", ip_address: "1.2.3.4" },
      request: {
        url: "https://x.lk/factories/sign-in/tok?a=1",
        data: { accountNumber: "123" },
        cookies: { gt_session: "s" },
        headers: { cookie: "gt_session=s" },
        query_string: "token=abc",
      },
      extra: { slip: "data" },
      exception: {
        values: [
          {
            type: "Error",
            value: "bad 912345678V",
            stacktrace: { frames: [{ filename: "a.ts", vars: { nic: "912345678V" } }] },
          },
        ],
      },
      breadcrumbs: [{ message: "a@b.lk", data: { url: "/c/K7Q2" } }],
    });
    expect(event.user).toEqual({ id: "u1" });
    expect(event.request).toEqual({ url: "https://x.lk/factories/sign-in/[redacted]" });
    expect(event.extra).toBeUndefined();
    expect(event.message).toBe("NIC [nic]");
    expect(event.exception?.values?.[0].value).toBe("bad [nic]");
    expect(event.exception?.values?.[0].stacktrace?.frames).toEqual([{ filename: "a.ts" }]);
    expect(event.breadcrumbs?.[0]).toEqual({ message: "[email]", data: { url: "/c/[redacted]" } });
  });
});

describe("scrubBreadcrumb", () => {
  it("drops form and request bodies", () => {
    expect(scrubBreadcrumb({ category: "fetch", data: { url: "/x", body: "nic" } })).toEqual({
      category: "fetch",
      data: { url: "/x" },
    });
  });
});
