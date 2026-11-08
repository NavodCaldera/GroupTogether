import { describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS, showDemoLogins } from "./demo-accounts";

describe("demo logins on the sign-in page", () => {
  it("show in development and hide in production unless switched on", () => {
    expect(showDemoLogins({ NODE_ENV: "development" })).toBe(true);
    expect(showDemoLogins({ NODE_ENV: "production" })).toBe(false);
    expect(showDemoLogins({ NODE_ENV: "production", SHOW_DEMO_LOGINS: "true" })).toBe(true);
  });

  it("cover the four admins, the factory owner and staff, the luxury brand and the buyers", () => {
    expect(DEMO_ACCOUNTS.map((a) => a.email)).toEqual([
      "core@groupbasket.lk",
      "premium@groupbasket.lk",
      "factory@groupbasket.lk",
      "buyers@groupbasket.lk",
      "seller@example.com",
      "packing@example.com",
      "sales@example.com",
      "brand@example.com",
      "buyer@example.com",
      "buyer2@example.com",
      "buyer3@example.com",
    ]);
  });
});
