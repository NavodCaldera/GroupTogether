import { describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS, DEMO_BUYERS, showDemoLogins } from "./demo-accounts";

describe("demo logins on the sign-in page", () => {
  it("show in development and hide in production unless switched on", () => {
    expect(showDemoLogins({ NODE_ENV: "development" })).toBe(true);
    expect(showDemoLogins({ NODE_ENV: "production" })).toBe(false);
    expect(showDemoLogins({ NODE_ENV: "production", SHOW_DEMO_LOGINS: "true" })).toBe(true);
  });

  it("list every demo buyer once", () => {
    expect(DEMO_ACCOUNTS.map((a) => a.email)).toEqual(Object.values(DEMO_BUYERS));
  });
});
