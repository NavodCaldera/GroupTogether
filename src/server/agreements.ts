import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { endsAtFor, reminderDue, sellingAllowed } from "@/lib/agreement-rules";
import { db, type Tx } from "./db";
import { PartnerError } from "./partners";
import { notify } from "./notify";

export async function latestAgreement(client: Tx = db) {
  return client.agreementVersion.findFirst({
    orderBy: { version: "desc" },
    select: { id: true, version: true, text: true, publishedAt: true },
  });
}
export async function canSell(factoryUserId: string, now = new Date()): Promise<boolean> {
  return canSellIn(db, factoryUserId, now);
}
export async function canSellIn(client: Tx, factoryUserId: string, now: Date): Promise<boolean> {
  const [owner, latest, acceptance] = await Promise.all([
    client.user.findFirst({
      where: { id: factoryUserId, role: "SELLER", factoryId: null, isBrand: false, locked: false },
      select: { factoryProfile: { select: { status: true, complianceDueAt: true } } },
    }),
    client.agreementVersion.findFirst({ orderBy: { version: "desc" }, select: { id: true } }),
    client.agreementAcceptance.findFirst({
      where: { factoryUserId },
      orderBy: [{ version: { version: "desc" } }, { acceptedAt: "desc" }],
      select: { versionId: true, endsAt: true },
    }),
  ]);
  const profile = owner?.factoryProfile;
  if (
    !profile ||
    !sellingAllowed({ ...profile, acceptance, latestVersionId: latest?.id ?? null }, now)
  )
    return false;
  // FR-007a: an agreement alone cannot bypass overdue legacy identity checks.
  return (
    profile.complianceDueAt === null ||
    profile.complianceDueAt > now ||
    !!(await client.factoryApplication.count({ where: { factoryUserId, status: "APPROVED" } }))
  );
}
/** Database-side equivalent of sellingAllowed, so pagination/facets cannot leak blocked sellers. */
export async function sellingFactoryWhere(
  now = new Date(),
  client: Tx = db,
): Promise<Prisma.UserWhereInput> {
  const latest = await client.agreementVersion.findFirst({
    orderBy: { version: "desc" },
    select: { id: true },
  });
  return {
    role: "SELLER",
    factoryId: null,
    isBrand: false,
    locked: false,
    factoryProfile: { is: { status: "ACTIVE" } },
    AND: [
      {
        OR: [
          { factoryProfile: { is: { complianceDueAt: null } } },
          { factoryProfile: { is: { complianceDueAt: { gt: now } } } },
          { factoryApplications: { some: { status: "APPROVED" } } },
        ],
      },
      {
        OR: [
          ...(latest
            ? [{ factoryAcceptances: { some: { versionId: latest.id, endsAt: { gt: now } } } }]
            : []),
          {
            factoryAcceptances: { none: {} },
            factoryProfile: { is: { complianceDueAt: { gt: now } } },
          },
        ],
      },
    ],
  };
}
export async function publishVersion(coreAdminId: string, text: string) {
  const user = await db.user.findUnique({
    where: { id: coreAdminId },
    select: { role: true, adminArea: true, locked: true },
  });
  if (!user || user.role !== "ADMIN" || user.adminArea !== "CORE" || user.locked)
    throw new PartnerError("CORE admin access required");
  if (!text.trim() || text.length > 100000)
    throw new PartnerError("Enter agreement text of up to 100000 characters");
  // Append only: no service or action can edit a published version.
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(731902)) AS l`;
    const latest = await tx.agreementVersion.findFirst({
      orderBy: { version: "desc" },
      select: { version: true },
    });
    return tx.agreementVersion.create({
      data: { version: (latest?.version ?? 0) + 1, text, publishedBy: coreAdminId },
    });
  });
}
export async function acceptLatest(ownerUserId: string, now = new Date()) {
  return acceptCurrent(ownerUserId, now);
}
/** The form must accept the version the person actually read. */
export async function acceptDisplayedVersion(
  ownerUserId: string,
  versionId: string,
  now = new Date(),
) {
  return acceptCurrent(ownerUserId, now, versionId);
}
async function acceptCurrent(ownerUserId: string, now: Date, expectedVersionId?: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(731902)) AS l`;
    await tx.$queryRaw`SELECT 1 FROM "FactoryProfile" WHERE "factoryUserId" = ${ownerUserId} FOR UPDATE`;
    const owner = await tx.user.findFirst({
      where: {
        id: ownerUserId,
        role: "SELLER",
        isBrand: false,
        factoryId: null,
        locked: false,
        factoryProfile: { is: { status: "ACTIVE" } },
      },
      select: { id: true },
    });
    if (!owner) throw new PartnerError("Only the factory owner can accept the agreement");
    const latest = await tx.agreementVersion.findFirst({
      orderBy: { version: "desc" },
      select: { id: true },
    });
    if (!latest) throw new PartnerError("No agreement has been published");
    if (expectedVersionId && latest.id !== expectedVersionId)
      throw new PartnerError("The agreement changed. Reload and read the current version");
    const existing = await tx.agreementAcceptance.findFirst({
      where: { factoryUserId: ownerUserId, versionId: latest.id },
      orderBy: { acceptedAt: "desc" },
    });
    if (existing && existing.endsAt > now && !reminderDue(existing.endsAt, null, now))
      return existing;
    return tx.agreementAcceptance.create({
      data: {
        factoryUserId: ownerUserId,
        acceptedById: ownerUserId,
        versionId: latest.id,
        acceptedAt: now,
        endsAt: endsAtFor(now),
      },
    });
  });
}
export async function remindAgreements(now = new Date()) {
  const latest = await db.agreementVersion.findFirst({
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (!latest) return;
  const due = await db.agreementAcceptance.findMany({
    where: {
      versionId: latest.id,
      endsAt: { gt: now, lte: new Date(now.getTime() + 30 * 86400000) },
      factory: { locked: false, factoryProfile: { is: { status: "ACTIVE" } } },
    },
    select: { id: true, factoryUserId: true, endsAt: true, remindedAt: true },
  });
  if (!due.length) return;
  const [terms, delivered] = await Promise.all([
    db.agreementAcceptance.groupBy({
      by: ["factoryUserId"],
      where: { factoryUserId: { in: due.map((a) => a.factoryUserId) }, versionId: latest.id },
      _max: { endsAt: true },
    }),
    db.notification.findMany({
      where: { id: { in: due.map((a) => `agreement-renewal:${a.id}:${a.factoryUserId}`) } },
      select: { id: true },
    }),
  ]);
  const lastEnd = new Map(terms.map((t) => [t.factoryUserId, t._max.endsAt?.getTime()]));
  const sent = new Set(delivered.map((n) => n.id));
  for (const a of due) {
    if (lastEnd.get(a.factoryUserId) !== a.endsAt.getTime() || !reminderDue(a.endsAt, null, now))
      continue;
    if (!a.remindedAt)
      await db.agreementAcceptance.updateMany({
        where: { id: a.id, remindedAt: null },
        data: { remindedAt: now },
      });
    // Delivery follows the committed marker. A deterministic notice ID makes retries safe,
    // including a crash between the marker and delivery; no per-factory read queries.
    if (!sent.has(`agreement-renewal:${a.id}:${a.factoryUserId}`))
      await notify(
        [a.factoryUserId],
        {
          title: "Factory agreement renewal",
          body: "Your agreement is due for renewal.",
          href: "/seller/agreement",
        },
        `agreement-renewal:${a.id}`,
      );
  }
}
