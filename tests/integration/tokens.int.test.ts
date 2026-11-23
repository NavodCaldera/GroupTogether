import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { D } from "@/lib/decimal";
import { db } from "@/server/db";
import { credit, tokenBalance } from "@/server/tokens";
import { makeBuyer, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

const refund = (userId: string) =>
  db.$transaction((tx) =>
    credit(tx, userId, new D("3000"), "PACK_REFUND", `refund:${userId}`, "Test"),
  );

describe("token ledger", () => {
  it("credits one event once under retries", async () => {
    const user = await makeBuyer();
    await Promise.all([refund(user.id), refund(user.id)]);
    expect((await tokenBalance(user.id)).toFixed(2)).toBe("3000.00");
    expect(await db.tokenEntry.count({ where: { userId: user.id } })).toBe(1);
  });

  it("protects append-only entries", async () => {
    const user = await makeBuyer();
    await refund(user.id);
    const entry = await db.tokenEntry.findFirstOrThrow({ where: { userId: user.id } });
    await expect(
      db.tokenEntry.update({ where: { id: entry.id }, data: { note: "rewrite" } }),
    ).rejects.toThrow(/append.only/i);
    await expect(db.tokenEntry.delete({ where: { id: entry.id } })).rejects.toThrow(/append.only/i);
  });
});
