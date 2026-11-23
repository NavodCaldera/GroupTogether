import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { startBasket } from "@/server/packs-join";
import { signNotice } from "@/server/payments/demo";
import { handleNotice } from "@/server/payments/notice";
import { tokenBalance } from "@/server/tokens";
import { makeBuyer, resetDb } from "./helpers";

const MERCHANT = "1200000";
const SECRET = "test-secret";

beforeEach(async () => {
  await resetDb();
  vi.stubEnv("PAYMENT_GATEWAY", "demo");
  vi.stubEnv("DEMO_MERCHANT_ID", MERCHANT);
  vi.stubEnv("DEMO_MERCHANT_SECRET", SECRET);
});
afterAll(() => db.$disconnect());

function notice(
  attemptId: string,
  o: { amount?: string; status?: string; currency?: string; paymentId?: string } = {},
  secret = SECRET,
) {
  const fields = {
    merchant_id: MERCHANT,
    order_id: attemptId,
    payment_id: o.paymentId ?? "pay_1",
    payhere_amount: o.amount ?? "150.00",
    payhere_currency: o.currency ?? "LKR",
    status_code: o.status ?? "2",
  };
  return handleNotice(
    new URLSearchParams({ ...fields, md5sig: signNotice(fields, secret) }).toString(),
    new Headers(),
  );
}

/** A buyer who started a basket and has an open payment for it. */
async function started() {
  const category = await db.category.create({ data: { slug: "c", name: "C" } });
  const company = await db.company.create({
    data: { slug: "co", name: "Co", categoryId: category.id },
  });
  const pack = await db.standardPack.create({
    data: { slug: "p", name: "Pack", durationDays: 30, companyId: company.id },
  });
  const v = await db.packVersion.create({
    data: {
      packId: pack.id,
      version: 1,
      publishedAt: new Date(),
      pricePerFamily: "150.00",
      groupSize: 5,
    },
  });
  const buyer = await makeBuyer();
  await startBasket(buyer.id, v.id);
  const attempt = await db.paymentAttempt.findFirstOrThrow({ where: { buyerId: buyer.id } });
  return { buyer, attempt };
}

const group = () => db.packGroup.findFirst();
const tokens = async (userId: string) => (await tokenBalance(userId)).toFixed(2);

describe("payment notices", () => {
  it("a paid notice opens the basket; a repeat changes nothing", async () => {
    const { attempt } = await started();
    expect(await notice(attempt.id)).toEqual({ status: 200 });
    expect(await notice(attempt.id)).toEqual({ status: 200 });
    expect((await group())?.status).toBe("OPEN");
    expect(await db.packMember.findFirst()).toMatchObject({ status: "PAID" });
    expect(await db.paymentEvent.count()).toBe(1);
  });

  it("a forged signature is refused and not recorded", async () => {
    const { attempt } = await started();
    expect(await notice(attempt.id, {}, "wrong")).toEqual({ status: 400 });
    expect(await db.paymentEvent.count()).toBe(0);
  });

  it("a wrong amount comes back as tokens and the spot stays unpaid", async () => {
    const { buyer, attempt } = await started();
    await notice(attempt.id, { amount: "100.00" });
    expect(await tokens(buyer.id)).toBe("100.00");
    expect((await group())?.status).toBe("PENDING");
  });

  it("a wrong currency credits nothing", async () => {
    const { buyer, attempt } = await started();
    await notice(attempt.id, { currency: "USD" });
    expect(await tokens(buyer.id)).toBe("0.00");
  });

  it("a failed payment drops the unopened basket; a pending one is only recorded", async () => {
    const { attempt } = await started();
    await notice(attempt.id, { status: "0" });
    expect(await group()).not.toBeNull();
    await notice(attempt.id, { status: "-2", paymentId: "pay_2" });
    expect(await group()).toBeNull();
    expect((await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status).toBe(
      "FAILED",
    );
  });

  it("a payment after the spot was released is credited once per payment id", async () => {
    const { buyer, attempt } = await started();
    await notice(attempt.id, { status: "-1" });
    for (let i = 0; i < 3; i++) await notice(attempt.id, { paymentId: "pay_late" });
    await notice(attempt.id, { paymentId: "pay_late_2" });
    expect(await tokens(buyer.id)).toBe("300.00");
    expect((await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status).toBe(
      "LATE_PAID",
    );
  });

  it("a notice for an unknown payment is recorded and acknowledged", async () => {
    expect(await notice("missing")).toEqual({ status: 200 });
    expect(await db.paymentEvent.findFirst()).toMatchObject({
      attemptId: null,
      outcome: "UNKNOWN_ATTEMPT",
    });
  });
});
