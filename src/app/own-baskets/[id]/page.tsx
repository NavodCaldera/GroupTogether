import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";

/** Old basket links and notices (DEC-028: no share links). Anyone in the basket goes to their
 * newest order in it; anyone else gets not found. */
export default async function OwnBasketPage({ params }: PageProps<"/own-baskets/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();
  const own = await db.basket.findUnique({ where: { id }, select: { ownerId: true, kind: true } });
  if (!own || own.kind !== "OWN") notFound();
  const order = await db.order.findFirst({
    where: { buyerId: user.id, OR: [{ basketId: id }, { targetBasketId: id }] },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (order) redirect(`/orders/${order.id}`);
  notFound();
}
