import { notFound, redirect } from "next/navigation";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";

/** Back from the gateway: on to the basket; the verified notice confirms the spot. */
export default async function BasketReturnPage({ params }: PageProps<"/baskets/return/[attemptId]">) {
  const attemptId = (await params).attemptId;
  const user = await requireUser([...BUYER_ROLES], `/baskets/return/${attemptId}`);
  const a = await db.paymentAttempt.findFirst({
    where: { id: attemptId, buyerId: user.id, purpose: "PACK_JOIN" },
    select: { packMember: { select: { groupId: true } } },
  });
  if (!a) notFound();
  redirect(a.packMember ? `/baskets/${a.packMember.groupId}` : "/");
}
