import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS, DEMO_BUYERS } from "@/lib/demo-accounts";
import { db } from "@/server/db";
import { openBaskets } from "@/server/packs";

const buyer = (email: string) => db.user.findUniqueOrThrow({ where: { email } });

describe("demo seed", () => {
  beforeAll(() => {
    // The same command the browser specs run, on the test database.
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "seed"], {
      env: { ...process.env },
      stdio: "pipe",
      timeout: 170_000,
    });
  }, 180_000);

  it("creates every listed login", async () => {
    const emails = DEMO_ACCOUNTS.map((a) => a.email);
    expect(await db.user.count({ where: { email: { in: emails } } })).toBe(emails.length);
  });

  it("marks every company as a demo listing", async () => {
    expect(await db.company.count({ where: { demo: false } })).toBe(0);
    expect(await db.company.count()).toBe(4);
  });

  it("shows Dilan two baskets nearby, his contact's first, and Tharindu none", async () => {
    const list = await openBaskets(await buyer(DEMO_BUYERS.dilan));
    expect(list?.map((b) => [b.packSlug, b.fromContact, b.joined])).toEqual([
      ["hemas-15-day", true, 1],
      ["hemas-30-day", false, 3],
    ]);
    expect(await openBaskets(await buyer(DEMO_BUYERS.tharindu))).toEqual([]);
  });
});
