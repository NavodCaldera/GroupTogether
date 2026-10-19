import { describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS, showDemoLogins } from "./demo-accounts";

describe("demo logins on the sign-in page", () => {
  it("show in development and hide in production unless switched on", () => {
    expect(showDemoLogins({ NODE_ENV: "development" })).toBe(true);
    expect(showDemoLogins({ NODE_ENV: "production" })).toBe(false);
    expect(showDemoLogins({ NODE_ENV: "production", SHOW_DEMO_LOGINS: "true" })).toBe(true);
  });

  it("cover the admin, the factory seller, the packing staff and the buyers", () => {
    expect(DEMO_ACCOUNTS.map((a) => a.email)).toEqual([
      "admin@grouptogether.lk",
      "seller@example.com",
      "packer@example.com",
      "packer2@example.com",
      "packer3@example.com",
      "buyer@example.com",
      "buyer2@example.com",
      "buyer3@example.com",
    ]);
  });
});
