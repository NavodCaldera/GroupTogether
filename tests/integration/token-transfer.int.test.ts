import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { D } from "@/lib/decimal";
import { post, TokenError, tokenBalance, transferTokens } from "@/server/tokens";
import { fundTokens, makeAgent, makeFactory, makeUser, resetDb } from "./helpers";
beforeEach(resetDb);
afterAll(() => db.$disconnect());

const balance = async (id: string) => (await tokenBalance(id)).toFixed(2);
const entries = () => db.tokenEntry.count();

describe("token transfers", () => {
  it("moves balance from sender to receiver", async () => {
    const a = await makeUser(),
      b = await makeUser();
    await fundTokens(a.id, "500");
    await transferTokens(a.id, b.phone!, "200", "req-1");
    expect(await balance(a.id)).toBe("300.00");
    expect(await balance(b.id)).toBe("200.00");
    const rows = await db.tokenEntry.findMany({
      where: { eventKey: { startsWith: "xfer:" } },
      orderBy: { eventKey: "asc" },
    });
    expect(rows.map((r) => [r.eventKey, r.kind, r.amount.toFixed(2), r.counterpartyId])).toEqual([
      [`xfer:${a.id}:req-1:in`, "TRANSFER_IN", "200.00", a.id],
      [`xfer:${a.id}:req-1:out`, "TRANSFER_OUT", "-200.00", b.id],
    ]);
  });

  it("finds the receiver by email ignoring case, and agents can receive", async () => {
    const a = await makeUser(),
      { user: agent } = await makeAgent();
    await fundTokens(a.id, "100");
    await transferTokens(a.id, agent.email.toUpperCase(), "40.50", "req-email");
    expect(await balance(agent.id)).toBe("40.50");
  });

  it("does only one transfer for the same request key", async () => {
    const a = await makeUser(),
      b = await makeUser();
    await fundTokens(a.id, "500");
    await transferTokens(a.id, b.phone!, "200", "same");
    await transferTokens(a.id, b.phone!, "200", "same");
    expect(await balance(a.id)).toBe("300.00");
    expect(await balance(b.id)).toBe("200.00");
    await expect(transferTokens(a.id, b.phone!, "100", "same")).rejects.toBeInstanceOf(TokenError);
    expect(await balance(a.id)).toBe("300.00");
  });

  it("refuses bad transfers and writes nothing", async () => {
    const a = await makeUser(),
      b = await makeUser();
    const { factory } = await makeFactory();
    const staff = await makeUser();
    await db.user.update({ where: { id: staff.id }, data: { factoryId: factory.id } });
    await fundTokens(a.id, "500");
    const before = await entries();
    const bad: [string, string][] = [
      [a.phone!, "10"],
      [factory.phone!, "10"],
      [staff.phone!, "10"],
      [b.phone!, "0"],
      [b.phone!, "-5"],
      [b.phone!, "1.005"],
      [b.phone!, "500.01"],
      ["0700000000", "10"],
    ];
    let i = 0;
    for (const [to, amount] of bad)
      await expect(transferTokens(a.id, to, amount, `bad-${i++}`)).rejects.toBeInstanceOf(
        TokenError,
      );
    await expect(transferTokens(a.id, b.phone!, "10", "bad key!")).rejects.toBeInstanceOf(
      TokenError,
    );
    expect(await entries()).toBe(before);
    expect(await balance(a.id)).toBe("500.00");
  });

  it("treats an event key reused with another kind as a conflict", async () => {
    const a = await makeUser();
    const e = { userId: a.id, amount: new D("5"), eventKey: "k1", note: "Test" };
    expect(await db.$transaction((tx) => post(tx, { ...e, kind: "AGENT_FEE" }))).toBe("created");
    expect(await db.$transaction((tx) => post(tx, { ...e, kind: "AGENT_FEE" }))).toBe("exists");
    await expect(
      db.$transaction((tx) => post(tx, { ...e, kind: "ORDER_CANCEL" })),
    ).rejects.toBeInstanceOf(TokenError);
  });

  it("lets two senders use the same request key", async () => {
    const a = await makeUser(),
      b = await makeUser(),
      c = await makeUser();
    await fundTokens(a.id, "100");
    await fundTokens(b.id, "100");
    await transferTokens(a.id, c.phone!, "10", "shared");
    await transferTokens(b.id, c.phone!, "15", "shared");
    expect(await balance(c.id)).toBe("25.00");
  });

  it("lets only one of two racing transfers spend the balance", async () => {
    const a = await makeUser(),
      b = await makeUser(),
      c = await makeUser();
    await fundTokens(a.id, "100");
    const results = await Promise.allSettled([
      transferTokens(a.id, b.phone!, "80", "race-b"),
      transferTokens(a.id, c.phone!, "80", "race-c"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(TokenError);
    expect(await balance(a.id)).toBe("20.00");
  });

  it("refuses a factory account that holds a test entry", async () => {
    const { factory } = await makeFactory();
    const b = await makeUser();
    await fundTokens(factory.id, "500");
    await expect(transferTokens(factory.id, b.phone!, "10", "factory")).rejects.toBeInstanceOf(
      TokenError,
    );
    expect(await balance(b.id)).toBe("0.00");
  });
});
