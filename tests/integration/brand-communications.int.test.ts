import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createBrandOffer, reviseBrandOffer } from "@/server/brands";
import { reviewBrandOffer } from "@/server/brand-reviews";
import {
  brandInbox,
  communicationActor,
  contextForThread,
  flushBrandNotices,
  markBrandThreadRead,
  resolveBrandThread,
  sendBrandMessage,
} from "@/server/brand-communications";
import {
  acknowledgeGift,
  approveGiftBill,
  recordGiftSettlement,
  respondToSettlement,
} from "@/server/gifts";
import { brandPhotoFor } from "@/server/brand-photos";
import { giftPhotoFile, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());
const terms = {
  name: "Premium gift",
  description: "Care collection",
  packDetails: "One gift pack",
  packSize: "200 ml",
  dispatchDays: 2,
  actualPrice: "5000",
  offerPrice: "3500",
  pieces: 20,
  productUrl: "https://brand.example/gift",
};
async function brand() {
  const user = await makeUser();
  return db.user.update({
    where: { id: user.id },
    data: {
      role: "SELLER",
      isBrand: true,
      website: "https://brand.example",
      company: "Test premium brand",
    },
  });
}
async function fixture() {
  const admin = await makeUser("ADMIN", "PREMIUM"),
    partner = await brand(),
    other = await brand();
  const offer = await createBrandOffer(partner.id, terms, giftPhotoFile());
  return { admin, partner, other, offer };
}
const input = (brandId: string, body: string, key = crypto.randomUUID()) => ({
  brandId,
  kind: "GENERAL",
  subjectId: "general",
  body,
  requestKey: key,
});
/** A stored gift order at the offer's current partner price (reservation is parked). */
async function storedGift(f: Awaited<ReturnType<typeof fixture>>, paid: boolean) {
  const recipient = await makeUser();
  const offer = await db.stockOffer.findUniqueOrThrow({ where: { id: f.offer.id } });
  return db.giftOrder.create({
    data: {
      offerId: f.offer.id,
      recipientId: recipient.id,
      status: paid ? "READY" : "RESERVED",
      retailValue: offer.actualPrice!,
      partnerPrice: offer.offerPrice!,
      recipientName: recipient.name,
      phone: recipient.phone!,
      address: "1 Test Rd",
      city: "Colombo",
      authorizedById: f.admin.id,
      paidAt: paid ? new Date() : null,
    },
  });
}
async function paidGift(f: Awaited<ReturnType<typeof fixture>>) {
  await reviewBrandOffer(f.admin.id, f.offer.id, 1, "approve", "");
  return storedGift(f, true);
}

describe("premium brand communication", () => {
  it("isolates brands, excludes shoppers/factories, and hides internal-only conversations", async () => {
    const f = await fixture();
    const thread = await sendBrandMessage(f.admin.id, {
      ...input(f.partner.id, "Private admin note"),
      internal: true,
    });
    expect(await brandInbox(f.partner.id)).toHaveLength(1); // product submission only
    expect((await brandInbox(f.partner.id)).some((row) => row.id === thread)).toBe(false);
    expect(
      await db.notification.count({ where: { userId: f.partner.id, href: { contains: thread } } }),
    ).toBe(0);
    await sendBrandMessage(f.admin.id, { ...input(f.partner.id, "Shared reply"), thread });
    const visible = (await brandInbox(f.partner.id)).find((row) => row.id === thread)!;
    expect(visible.unread).toBe(1);
    await expect(contextForThread(await communicationActor(f.other.id), thread)).rejects.toThrow(
      "not found",
    );
    await expect(markBrandThreadRead(f.other.id, thread, new Date())).rejects.toThrow("not found");
    await expect(
      sendBrandMessage(f.partner.id, {
        ...input(f.partner.id, "Attempted private note"),
        internal: true,
      }),
    ).rejects.toThrow("admins only");
    const buyer = await makeUser(),
      factory = await makeUser();
    await db.user.update({ where: { id: factory.id }, data: { role: "SELLER" } });
    await expect(communicationActor(buyer.id)).rejects.toThrow("admins and premium brands");
    await expect(communicationActor(factory.id)).rejects.toThrow("admins and premium brands");
    expect(await brandPhotoFor(f.other, f.offer.id, 1)).toBeNull();
    expect(await brandPhotoFor(buyer, f.offer.id, 1)).toBeNull();
  });

  it("deduplicates concurrent sends, preserves per-admin read state and retry-safe notifications", async () => {
    const f = await fixture(),
      secondAdmin = await makeUser("ADMIN", "PREMIUM");
    const request = input(f.partner.id, "Please review the campaign");
    const ids = await Promise.all([
      sendBrandMessage(f.partner.id, request),
      sendBrandMessage(f.partner.id, request),
    ]);
    expect(ids[0]).toBe(ids[1]);
    expect(await db.brandMessage.count({ where: { requestKey: request.requestKey } })).toBe(1);
    const message = await db.brandMessage.findUniqueOrThrow({
      where: { requestKey: request.requestKey },
    });
    expect((await brandInbox(f.admin.id)).find((row) => row.id === ids[0])?.needsReply).toBe(true);
    await markBrandThreadRead(f.admin.id, ids[0], message.createdAt);
    await markBrandThreadRead(f.admin.id, ids[0], new Date(message.createdAt.getTime() - 100));
    expect((await brandInbox(f.admin.id)).find((row) => row.id === ids[0])?.unread).toBe(0);
    expect((await brandInbox(secondAdmin.id)).find((row) => row.id === ids[0])?.unread).toBe(1);
    await db.brandMessage.update({ where: { id: message.id }, data: { notifiedAt: null } });
    await flushBrandNotices();
    expect(
      await db.notification.count({
        where: { userId: f.admin.id, href: { contains: ids[0] }, readAt: null },
      }),
    ).toBe(0);
    expect(
      await db.notification.count({
        where: { userId: secondAdmin.id, href: { contains: ids[0] } },
      }),
    ).toBe(1);
    await resolveBrandThread(f.admin.id, ids[0], true);
    expect((await brandInbox(f.admin.id)).find((row) => row.id === ids[0])?.needsReply).toBe(false);
    await sendBrandMessage(f.partner.id, {
      ...input(f.partner.id, "Following up"),
      thread: ids[0],
    });
    expect((await brandInbox(f.admin.id)).find((row) => row.id === ids[0])?.needsReply).toBe(true);
  });

  it("blocks unpaid gift conversations and notifications, and acknowledges only paid orders", async () => {
    const f = await fixture();
    await reviewBrandOffer(f.admin.id, f.offer.id, 1, "approve", "");
    const gift = await storedGift(f, false);
    const thread = await sendBrandMessage(f.admin.id, {
      ...input(f.partner.id, "Recipient instruction"),
      kind: "GIFT",
      subjectId: gift.id,
    });
    expect((await brandInbox(f.partner.id)).some((row) => row.id === thread)).toBe(false);
    expect(
      await db.notification.count({ where: { userId: f.partner.id, href: { contains: thread } } }),
    ).toBe(0);
    await expect(contextForThread(await communicationActor(f.partner.id), thread)).rejects.toThrow(
      "not found",
    );
    await expect(acknowledgeGift(f.partner.id, gift.id)).rejects.toThrow("paid gift");
  });

  it("records requested changes, rejects stale decisions, and activates new prices only after approval", async () => {
    const f = await fixture();
    await expect(reviewBrandOffer(f.admin.id, f.offer.id, 1, "changes", "")).rejects.toThrow(
      "Explain",
    );
    await reviewBrandOffer(
      f.admin.id,
      f.offer.id,
      1,
      "changes",
      "Please offer a stronger partner discount.",
    );
    expect((await db.stockOffer.findUniqueOrThrow({ where: { id: f.offer.id } })).status).toBe(
      "CHANGES_REQUESTED",
    );
    await reviseBrandOffer(f.partner.id, f.offer.id, { ...terms, offerPrice: "3200" }, null, 1);
    await expect(reviewBrandOffer(f.admin.id, f.offer.id, 1, "approve", "")).rejects.toThrow(
      "changed or was already",
    );
    await expect(reviseBrandOffer(f.partner.id, f.offer.id, terms, null, 1)).rejects.toThrow(
      "Refresh",
    );
    await reviewBrandOffer(f.admin.id, f.offer.id, 2, "approve", "");
    const gift = await storedGift(f, false);
    await reviseBrandOffer(
      f.partner.id,
      f.offer.id,
      { ...terms, offerPrice: "3000" },
      giftPhotoFile(),
      2,
    );
    expect(
      (await db.stockOffer.findUniqueOrThrow({ where: { id: f.offer.id } })).offerPrice?.toString(),
    ).toBe("3200");
    expect(await brandPhotoFor(f.admin, f.offer.id, 3)).not.toBeNull();
    await reviewBrandOffer(f.admin.id, f.offer.id, 3, "approve", "");
    expect(
      (await db.giftOrder.findUniqueOrThrow({ where: { id: gift.id } })).partnerPrice.toString(),
    ).toBe("3200");
    expect(
      (await db.stockOffer.findUniqueOrThrow({ where: { id: f.offer.id } })).offerPrice?.toString(),
    ).toBe("3000");
    expect(await db.brandOfferRevision.count({ where: { offerId: f.offer.id } })).toBe(3);
    await reviseBrandOffer(
      f.partner.id,
      f.offer.id,
      { ...terms, actualPrice: "100000000000", offerPrice: "99999999999", pieces: 1 },
      null,
      3,
    );
    await expect(reviewBrandOffer(f.admin.id, f.offer.id, 4, "approve", "")).rejects.toThrow(
      "Reduce the campaign quantity",
    );
    expect(
      await db.brandMessage.count({ where: { body: { contains: "stronger partner discount" } } }),
    ).toBe(1);
  });

  it("keeps settlement amounts immutable through acknowledgement, queries and receipt confirmation", async () => {
    const f = await fixture(),
      gift = await paidGift(f);
    await Promise.all([
      acknowledgeGift(f.partner.id, gift.id),
      acknowledgeGift(f.partner.id, gift.id),
    ]);
    expect(await db.brandMessage.count({ where: { requestKey: `gift-ack:${gift.id}` } })).toBe(1);
    await approveGiftBill(f.admin.id, gift.id);
    const payment = await recordGiftSettlement(
      f.admin.id,
      f.partner.id,
      [gift.id],
      "TEST-SUNDAY-001",
    );
    await expect(respondToSettlement(f.other.id, payment.id, "received", "")).rejects.toThrow(
      "not found",
    );
    await respondToSettlement(
      f.partner.id,
      payment.id,
      "query",
      "Please check the bank reference.",
    );
    expect(
      (await db.giftSettlement.findUniqueOrThrow({ where: { id: payment.id } })).queryOpen,
    ).toBe(true);
    await expect(
      respondToSettlement(f.partner.id, payment.id, "resolve-query", "Closed"),
    ).rejects.toThrow("not permitted");
    await respondToSettlement(
      f.admin.id,
      payment.id,
      "resolve-query",
      "Bank reference checked; transfer completed.",
    );
    await respondToSettlement(f.partner.id, payment.id, "received", "");
    const saved = await db.giftSettlement.findUniqueOrThrow({ where: { id: payment.id } });
    expect(saved.receivedAt).not.toBeNull();
    expect(saved.queryOpen).toBe(false);
    expect(saved.amount.toString()).toBe("3500");
    expect((await db.giftOrder.findUniqueOrThrow({ where: { id: gift.id } })).settlementId).toBe(
      payment.id,
    );
  });
});

describe("premium admin boundaries", () => {
  it("connects brands to premium admins and denies factory and warehouse access", async () => {
    const f = await fixture();
    const admins = await Promise.all(
      ["PREMIUM", "FACTORY", "AGENTS"].map(async (area) => {
        const user = await makeUser("ADMIN", "PREMIUM");
        return db.user.update({
          where: { id: user.id },
          data: { adminArea: area as "PREMIUM" | "FACTORY" | "AGENTS" },
        });
      }),
    );
    const [premium, factory, warehouse] = admins;
    const thread = await sendBrandMessage(
      f.partner.id,
      input(f.partner.id, "Please review our gift campaign."),
    );
    expect((await brandInbox(premium.id)).some((row) => row.id === thread)).toBe(true);
    expect(
      await db.notification.count({ where: { userId: premium.id, href: { contains: thread } } }),
    ).toBe(1);
    for (const denied of [factory, warehouse]) {
      await expect(communicationActor(denied.id)).rejects.toThrow("workspace");
      await expect(brandInbox(denied.id)).rejects.toThrow("workspace");
      await expect(reviewBrandOffer(denied.id, f.offer.id, 1, "approve", "")).rejects.toThrow(
        "workspace",
      );
      expect(await brandPhotoFor(denied, f.offer.id)).toBeNull();
      expect(await brandPhotoFor(denied, f.offer.id, 1)).toBeNull();
      expect(
        await db.notification.count({ where: { userId: denied.id, href: { contains: thread } } }),
      ).toBe(0);
    }
    await reviewBrandOffer(premium.id, f.offer.id, 1, "approve", "");
    expect(await brandPhotoFor(premium, f.offer.id)).not.toBeNull();
    for (const denied of [factory, warehouse]) {
      await expect(approveGiftBill(denied.id, "missing")).rejects.toThrow("Only admins");
      await expect(
        recordGiftSettlement(denied.id, f.partner.id, ["missing"], "test"),
      ).rejects.toThrow("Only admins");
    }
  });
});
