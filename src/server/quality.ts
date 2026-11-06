import { closeRemovedHolds } from "./fault-holds";
import "server-only";
import { db } from "./db";
import { CartError } from "./carts/errors";
import { lockCart, lockUserAdvisory, withCartTransaction } from "./carts/locks";
import { removeHiddenProductLines, sweep, cancelUnpaidCart } from "./carts/service";
import { cancelPaidLines, flushCancellationNotices } from "./cancellations";
import { flushQualityNotices } from "./quality-notices";
import { setUserLocked } from "./auth/service";
import { factoryScore, productFlagged, factoryFlagged } from "@/lib/quality-rules";
import { handoffRemovedReturns, flushReturnNotices } from "./returns";
export class QualityError extends CartError {}
export async function assertQualityAdmin(adminId: string) {
  const admin = await db.user.findFirst({
    where: { id: adminId, role: "ADMIN", locked: false, adminArea: { in: ["FACTORY", "CORE"] } },
    select: { id: true },
  });
  if (!admin) throw new QualityError("Quality admin access required");
}
function reasonValue(reason: string) {
  const value = reason.trim();
  if (value.length < 1 || value.length > 2000)
    throw new QualityError("Give a reason from 1 to 2000 characters");
  return value;
}
/** Metadata commits BEFORE cart locks. One cart per transaction; every step is safe to re-run. */
async function cleanProducts(
  productIds: string[],
  reason: string,
  actorId: string,
  wholeFactory = false,
) {
  const carts = await db.groupCart.findMany({
    where: {
      status: {
        in: wholeFactory
          ? ["OPEN", "READY", "AWAITING_SLIP", "SLIP_REVIEW", "CONFIRMED"]
          : ["OPEN", "READY"],
      },
      lines: { some: { status: "ACTIVE", variant: { productId: { in: productIds } } } },
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  for (const { id } of carts) {
    await sweep(new Date(), id);
    await withCartTransaction([id], [actorId], async (tx) => {
      const cart = await lockCart(tx, id);
      if (["OPEN", "READY"].includes(cart.status)) {
        const removed = await removeHiddenProductLines(tx, id, productIds);
        for (const line of removed)
          await tx.qualityNotice.upsert({
            where: { id: `hidden-line:${line.id}` },
            create: {
              id: `hidden-line:${line.id}`,
              userId: line.userId,
              title: `Item removed from ${cart.name || cart.code}`,
              body: reason,
              href: `/c/${cart.code}`,
            },
            update: {},
          });
      } else if (wholeFactory && ["AWAITING_SLIP", "SLIP_REVIEW"].includes(cart.status)) {
        const members = await tx.cartMember.findMany({
          where: { cartId: id },
          select: { userId: true },
        });
        await cancelUnpaidCart(tx, cart, reason);
        for (const member of members)
          await tx.qualityNotice.upsert({
            where: { id: `factory-cancel:${id}:${member.userId}` },
            create: {
              id: `factory-cancel:${id}:${member.userId}`,
              userId: member.userId,
              title: "A group cart was cancelled",
              body: reason,
              href: `/c/${cart.code}`,
            },
            update: {},
          });
      } else if (wholeFactory && cart.status === "CONFIRMED") {
        const lines = await tx.cartLine.findMany({
          where: { cartId: id, status: "ACTIVE", variant: { productId: { in: productIds } } },
          select: { id: true },
        });
        await cancelPaidLines(
          tx,
          lines.map((l) => l.id),
          reason,
        );
      }
    });
  }
}
export async function cleanFactoryCarts(
  factoryId: string,
  reason: string,
  actorId: string,
): Promise<void> {
  const products = await db.product.findMany({
    where: { sellerId: factoryId },
    select: { id: true },
  });
  await cleanProducts(
    products.map((p) => p.id),
    reason,
    actorId,
    true,
  );
}
export async function hideProduct(
  adminId: string,
  productId: string,
  reason: string,
): Promise<void> {
  await assertQualityAdmin(adminId);
  const why = reasonValue(reason);
  const product = await db.product.findFirst({
    where: { id: productId, OR: [{ sellerId: null }, { seller: { isBrand: false } }] },
    select: { id: true },
  });
  if (!product) throw new QualityError("Product not found");
  await db.product.updateMany({
    where: { id: productId, OR: [{ hiddenAt: null }, { hiddenByHoldId: { not: null } }] },
    data: { hiddenAt: new Date(), hiddenById: adminId, hiddenReason: why, hiddenByHoldId: null },
  });
  const saved = await db.product.findUniqueOrThrow({
    where: { id: productId },
    select: { hiddenReason: true },
  });
  await cleanProducts([productId], saved.hiddenReason || why, adminId);
  await flushQualityNotices();
  await flushCancellationNotices();
}
export async function removeFactory(
  adminId: string,
  factoryUserId: string,
  reason: string,
  holdEarnings: boolean,
  note?: string,
): Promise<void> {
  await assertQualityAdmin(adminId);
  const why = reasonValue(reason);
  if (holdEarnings && (!note?.trim() || note.trim().length > 2000))
    throw new QualityError("Give the earnings-hold note");
  const factory = await db.user.findFirst({
    where: { id: factoryUserId, role: "SELLER", factoryId: null, isBrand: false },
    select: { id: true, factoryProfile: { select: { status: true } } },
  });
  if (!factory?.factoryProfile) throw new QualityError("Factory not found");
  await db.$transaction(async (tx) => {
    await lockUserAdvisory(tx, factoryUserId);
    await tx.factoryProfile.updateMany({
      where: { factoryUserId, status: "ACTIVE" },
      data: {
        status: "REMOVED",
        removedAt: new Date(),
        removedById: adminId,
        removalReason: why,
        earningsHeld: holdEarnings,
        earningsHeldNote: holdEarnings ? note!.trim() : null,
      },
    });
    if (holdEarnings)
      await tx.factoryProfile.update({
        where: { factoryUserId },
        data: { earningsHeld: true, earningsHeldNote: note!.trim() },
      });
    const profile = await tx.factoryProfile.findUniqueOrThrow({ where: { factoryUserId } });
    await handoffRemovedReturns(tx, factoryUserId);
    // Acquire product rows in the same sorted order as confirmation's share locks.
    // The owner advisory also fences new listings and staff creation; no cart locks here.
    await tx.$queryRaw`SELECT 1 FROM "Product" WHERE "sellerId"=${factoryUserId} ORDER BY id FOR UPDATE`;
    await tx.product.updateMany({
      where: { sellerId: factoryUserId, hiddenAt: null },
      data: {
        hiddenAt: profile.removedAt ?? new Date(),
        hiddenById: adminId,
        hiddenReason: profile.removalReason || why,
      },
    });
  });
  await closeRemovedHolds(factoryUserId, adminId, why);
  await flushReturnNotices();
  const users = await db.user.findMany({
    where: { role: "SELLER", OR: [{ id: factoryUserId }, { factoryId: factoryUserId }] },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  for (const user of users) await setUserLocked(user.id, true);
  const profile = await db.factoryProfile.findUniqueOrThrow({ where: { factoryUserId } });
  await cleanFactoryCarts(factoryUserId, profile.removalReason || why, adminId);
  await flushQualityNotices();
  await flushCancellationNotices();
}
export async function qualityOverview(adminId: string, now = new Date()) {
  await assertQualityAdmin(adminId);
  const [products, factories] = await Promise.all([
    db.product.findMany({
      where: { OR: [{ sellerId: null }, { seller: { isBrand: false } }] },
      select: {
        id: true,
        title: true,
        sellerId: true,
        hiddenAt: true,
        hiddenReason: true,
        productRatings: {
          select: {
            stars: true,
            createdAt: true,
            report: {
              select: {
                reason: true,
                note: true,
                createdAt: true,
                photos: { select: { id: true } },
              },
            },
          },
        },
      },
      orderBy: { title: "asc" },
    }),
    db.user.findMany({
      where: { role: "SELLER", factoryId: null, isBrand: false },
      select: {
        id: true,
        name: true,
        company: true,
        factoryProfile: true,
        ratingsReceived: { select: { stars: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  const rows = products.map((p) => ({
    ...p,
    score: factoryScore(
      p.productRatings.map((r) => r.stars),
      [],
    ),
    flagged: productFlagged(
      p.productRatings.map((r) => r.stars),
      p.productRatings.flatMap((r) => (r.report ? [r.report.createdAt] : [])),
      now,
    ),
  }));
  return {
    products: rows,
    factories: factories.map((f) => {
      const own = rows.filter((p) => p.sellerId === f.id),
        score = factoryScore(
          own.flatMap((p) => p.productRatings.map((r) => r.stars)),
          f.ratingsReceived.map((r) => r.stars),
        ),
        flaggedProducts = own.filter((p) => p.flagged).length;
      return { ...f, score, flaggedProducts, flagged: factoryFlagged(score, flaggedProducts) };
    }),
  };
}
