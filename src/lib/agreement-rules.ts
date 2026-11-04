import type { FactoryStatus } from "@/generated/prisma/client";
export function sellingAllowed(
  p: {
    status: FactoryStatus;
    complianceDueAt: Date | null;
    acceptance: { versionId: string; endsAt: Date } | null;
    latestVersionId: string | null;
  },
  now: Date,
): boolean {
  if (p.status !== "ACTIVE") return false;
  if (p.acceptance)
    return (
      p.latestVersionId !== null &&
      p.acceptance.versionId === p.latestVersionId &&
      p.acceptance.endsAt > now
    );
  return p.complianceDueAt !== null && p.complianceDueAt > now;
}
/** Colombo calendar anniversary, preserving local time and clamping February 29 to February 28. */
export function endsAtFor(acceptedAt: Date): Date {
  const offset = 330 * 60_000;
  const result = new Date(acceptedAt.getTime() + offset);
  const month = result.getUTCMonth();
  result.setUTCFullYear(result.getUTCFullYear() + 1);
  if (result.getUTCMonth() !== month) result.setUTCDate(0);
  return new Date(result.getTime() - offset);
}
export function reminderDue(endsAt: Date, remindedAt: Date | null, now: Date): boolean {
  return remindedAt === null && endsAt > now && endsAt.getTime() - now.getTime() <= 30 * 86400000;
}
