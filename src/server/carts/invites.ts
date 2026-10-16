import "server-only";
import { isEditable } from "@/lib/cart-rules";
import { db } from "../db";
import { notify } from "../notify";
import { CartError } from "./service";

/** A member invites a registered user by email or mobile number; they get an in-app notice and an email. */
export async function inviteToCart(fromId: string, cartId: string, contact: string) {
  const raw = contact.trim();
  if (!raw) throw new CartError("Enter an email or mobile number");
  const phone = raw.replace(/[\s-]/g, "").replace(/^\+94/, "0");
  const target = await db.user.findFirst({
    where: raw.includes("@") ? { email: raw.toLowerCase() } : { phone },
    select: { id: true, name: true },
  });
  if (!target)
    throw new CartError(
      "No GroupTogether account has that email or number. Share the link instead.",
    );

  const cart = await db.groupCart.findUnique({
    where: { id: cartId },
    include: { members: { select: { userId: true } } },
  });
  if (!cart) throw new CartError("Cart not found");
  if (!cart.members.some((m) => m.userId === fromId))
    throw new CartError("Join the cart before inviting people");
  if (!isEditable(cart.status)) throw new CartError("This cart is no longer taking members");
  if (cart.members.some((m) => m.userId === target.id))
    throw new CartError(`${target.name} is already in this cart`);

  const from = await db.user.findUniqueOrThrow({ where: { id: fromId }, select: { name: true } });
  await db.cartInvite.upsert({
    where: { cartId_invitedUserId: { cartId, invitedUserId: target.id } },
    create: { cartId, invitedById: fromId, invitedUserId: target.id },
    update: { invitedById: fromId, createdAt: new Date() },
  });
  await notify(
    [target.id],
    {
      title: `${from.name} invited you to a group cart`,
      body: `Join "${cart.name || cart.code}" and help it reach the minimum order together.`,
      href: `/c/${cart.code}`,
    },
    { email: true },
  );
  return target.name;
}
