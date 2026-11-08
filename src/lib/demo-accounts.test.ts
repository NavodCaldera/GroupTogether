import { describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS, showDemoLogins } from "./demo-accounts";

describe("demo logins on the sign-in page", () => {
  it("show in development and hide in production unless switched on", () => {
    expect(showDemoLogins({ NODE_ENV: "development" })).toBe(true);
    expect(showDemoLogins({ NODE_ENV: "production" })).toBe(false);
    expect(showDemoLogins({ NODE_ENV: "production", SHOW_DEMO_LOGINS: "true" })).toBe(true);
  });

  it("cover the four admins, both factories' staff, the brand, the agents and the buyers", () => {
    expect(DEMO_ACCOUNTS.map((a) => a.email)).toEqual([
      "core@groupbasket.lk",
      "premium@groupbasket.lk",
      "factory@groupbasket.lk",
      "buyers@groupbasket.lk",
      "seller@example.com",
      "packing@example.com",
      "sales@example.com",
      "seller2@example.com",
      "packing2@example.com",
      "sales2@example.com",
      "brand@example.com",
      "agent@example.com",
      "agent2@example.com",
      "agent3@example.com",
      "applicant@example.com",
      "buyer@example.com",
      "buyer2@example.com",
      "buyer3@example.com",
      "buyer4@example.com",
      "buyer5@example.com",
      "buyer6@example.com",
    ]);
  });
});
