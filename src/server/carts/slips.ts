import "server-only";
import { assertAdminArea } from "../auth/service";
import { toD } from "@/lib/decimal";
import { addHours, amountDue } from "@/lib/cart-rules";
import { formatLKR } from "@/lib/format";
import { db } from "../db";
import { notify } from "../notify";
import { getSettings } from "../settings";
import { SLIP_TYPES, checkUpload, saveUpload } from "../storage";
import { CartError } from "./errors";
import { withCartTransaction } from "./locks";
import { confirmPaidCart, notifyCartConfirmed } from "./confirmation";

/**
 * The owner's one bank slip for the whole cart. There are no refunds: stock is locked from the
 * moment items are added, so an approved slip is always for goods we have.
 */
export async function uploadSlip(
  ownerId: string,
  cartId: string,
  file: File | null,
  now = new Date(),
) {
  checkUpload(file, SLIP_TYPES, "bank slip");
  // Check before storing the file, then again under the lock.
  const before = await db.groupCart.findUnique({ where: { id: cartId } });
  if (!before || before.ownerId !== ownerId) throw new CartError("Only the cart owner pays");
  if (before.status !== "AWAITING_SLIP") throw new CartError("This cart isn't waiting for a slip");
  const saved = await saveUpload(file!, `slips/${cartId}`, SLIP_TYPES);

  const { cart, due } = await withCartTransaction([cartId], [ownerId], async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "GroupCart" WHERE id = ${cartId} FOR UPDATE`;
    const cart = await tx.groupCart.findUniqueOrThrow({ where: { id: cartId } });
    if (cart.status !== "AWAITING_SLIP") throw new CartError("This cart isn't waiting for a slip");
    if (cart.slipDueAt && cart.slipDueAt <= now)
      throw new CartError("The 2-hour payment window has closed");
    const lines = await tx.cartLine.findMany({
      where: { cartId },
      select: { tokensApplied: true },
    });
    const due = amountDue(
      toD(cart.total),
      lines.map((l) => toD(l.tokensApplied)),
    );
    await tx.paymentSlip.create({
      data: { cartId, uploaderId: ownerId, amount: due.toFixed(2), ...saved },
    });
    return {
      cart: await tx.groupCart.update({ where: { id: cartId }, data: { status: "SLIP_REVIEW" } }),
      due,
    };
  });

  const admins = await db.user.findMany({
    where: { role: "ADMIN", locked: false, adminArea: "WAREHOUSE" },
    select: { id: true },
  });
  await notify(
    admins.map((a) => a.id),
    {
      title: "Bank slip to review",
      body: `Cart ${cart.code}: ${formatLKR(due)}`,
      href: "/admin/slips",
    },
  );
}

async function lockedSlip(slipId: string) {
  const slip = await db.paymentSlip.findUnique({ where: { id: slipId } });
  if (!slip) throw new CartError("Slip not found");
  return slip;
}

/** SLIP_REVIEW → CONFIRMED: the locked stock becomes a sale. */
export async function approveSlip(adminId: string, slipId: string, now = new Date()) {
  await assertAdminArea(adminId, "WAREHOUSE");
  const slip = await lockedSlip(slipId);
  const cart = await withCartTransaction([slip.cartId], [adminId], async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "GroupCart" WHERE id = ${slip.cartId} FOR UPDATE`;
    const cart = await tx.groupCart.findUniqueOrThrow({ where: { id: slip.cartId } });
    const fresh = await tx.paymentSlip.findUniqueOrThrow({ where: { id: slipId } });
    if (fresh.status !== "PENDING" || cart.status !== "SLIP_REVIEW")
      throw new CartError("This slip has already been reviewed");
    await tx.paymentSlip.update({
      where: { id: slipId },
      data: { status: "APPROVED", reviewerId: adminId, reviewedAt: now },
    });
    return confirmPaidCart(tx, cart.id, adminId, now);
  });
  await notifyCartConfirmed(cart);
}

/** SLIP_REVIEW → AWAITING_SLIP with a fresh payment window, so the owner can upload again. */
export async function rejectSlip(adminId: string, slipId: string, note: string, now = new Date()) {
  await assertAdminArea(adminId, "WAREHOUSE");
  const reason = note.trim();
  if (reason.length < 3) throw new CartError("Say why the slip was rejected");
  const slip = await lockedSlip(slipId);
  const settings = await getSettings();
  const cart = await withCartTransaction([slip.cartId], [adminId], async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "GroupCart" WHERE id = ${slip.cartId} FOR UPDATE`;
    const cart = await tx.groupCart.findUniqueOrThrow({ where: { id: slip.cartId } });
    const fresh = await tx.paymentSlip.findUniqueOrThrow({ where: { id: slipId } });
    if (fresh.status !== "PENDING" || cart.status !== "SLIP_REVIEW")
      throw new CartError("This slip has already been reviewed");
    await tx.paymentSlip.update({
      where: { id: slipId },
      data: { status: "REJECTED", reviewNote: reason, reviewerId: adminId, reviewedAt: now },
    });
    return tx.groupCart.update({
      where: { id: cart.id },
      data: { status: "AWAITING_SLIP", slipDueAt: addHours(now, settings.slipWindowHours) },
    });
  });
  await notify([cart.ownerId], {
    title: "Your bank slip was not accepted",
    body: `${reason}. Please upload a new slip within ${settings.slipWindowHours} hours or the order will be cancelled.`,
    href: `/c/${cart.code}/pay`,
  });
}
