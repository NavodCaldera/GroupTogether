import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { D } from "@/lib/decimal";
import { db } from "@/server/db";
import { credit, tokenBalance } from "@/server/tokens";
import { makeUser, resetDb } from "./helpers";
beforeEach(resetDb);
afterAll(() => db.$disconnect());
async function fund(userId: string, amount = "3000", ref = `fund:${userId}`) {
  await db.$transaction((tx) =>
    credit(tx, userId, new D(amount), "RETURN", { returnId: ref }, "Test credit"),
  );
}
describe("token ledger", () => {
  it("credits a business reference once under retries", async () => {
    const user = await makeUser();
    await Promise.all([fund(user.id, "3000"), fund(user.id, "3000")]);
    expect((await tokenBalance(user.id)).toFixed(2)).toBe("3000.00");
    expect(await db.tokenEntry.count({ where: { userId: user.id } })).toBe(1);
  });
  it("protects append-only entries", async () => {
    const user = await makeUser();
    await fund(user.id);
    const entry = await db.tokenEntry.findFirstOrThrow({ where: { userId: user.id } });
    await expect(
      db.tokenEntry.update({ where: { id: entry.id }, data: { note: "rewrite" } }),
    ).rejects.toThrow(/append.only/i);
    await expect(db.tokenEntry.delete({ where: { id: entry.id } })).rejects.toThrow(/append.only/i);
  });
});
