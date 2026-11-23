import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";

/** Back from the gateway: on to the basket; the verified notice confirms the spot. */
export default async function BasketReturnPage({
  params,
}: PageProps<"/baskets/return/[attemptId]">) {
  const attemptId = (await params).attemptId;
  const user = await requireUser(`/baskets/return/${attemptId}`);
  const a = await db.paymentAttempt.findFirst({
    where: { id: attemptId, buyerId: user.id },
    select: { packMember: { select: { groupId: true } } },
  });
  if (!a) notFound();
  redirect(a.packMember ? `/baskets/${a.packMember.groupId}` : "/");
}
