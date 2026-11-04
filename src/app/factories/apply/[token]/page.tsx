import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { ApplicationForm } from "../application-form";
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await db.factoryInvite.findUnique({
    where: { token },
    select: { expiresAt: true, usedAt: true },
  });
  if (!invite || invite.usedAt || invite.expiresAt <= new Date()) notFound();
  return <ApplicationForm token={token} />;
}
