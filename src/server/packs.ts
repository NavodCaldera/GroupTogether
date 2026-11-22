import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { AppError } from "./errors";

/** Family packs (DEC-030): category → company → standard pack → local group at a pickup point. */

export const MIN_GROUP = 5;
export const MAX_GROUP = 15;

/** Categories that hold at least one active company with a published pack. */
export async function listPackCategories() {
  return db.category.findMany({
    where: {
      active: true,
      companies: {
        some: { active: true, packs: { some: { active: true, versions: { some: { publishedAt: { not: null } } } } } },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { slug: true, name: true, _count: { select: { companies: true } } },
  });
}

export async function listCompanies(categorySlug: string) {
  const category = await db.category.findUnique({
    where: { slug: categorySlug },
    select: { slug: true, name: true },
  });
  if (!category) return null;
  const companies = await db.company.findMany({
    where: {
      active: true,
      category: { slug: categorySlug },
      packs: { some: { active: true, versions: { some: { publishedAt: { not: null } } } } },
    },
    orderBy: { name: "asc" },
    select: { slug: true, name: true, demo: true, _count: { select: { packs: true } } },
  });
  return { category, companies };
}

const latest = {
  where: { publishedAt: { not: null } },
  orderBy: { version: "desc" },
  take: 1,
} as const;

export async function listPacks(companySlug: string) {
  const company = await db.company.findUnique({
    where: { slug: companySlug },
    select: { slug: true, name: true, demo: true, category: { select: { slug: true, name: true } } },
  });
  if (!company) return null;
  const packs = await db.standardPack.findMany({
    where: { active: true, company: { slug: companySlug } },
    orderBy: { durationDays: "asc" },
    select: {
      slug: true,
      name: true,
      durationDays: true,
      versions: { ...latest, select: { pricePerFamily: true, groupSize: true, _count: { select: { items: true } } } },
    },
  });
  return { company, packs: packs.filter((p) => p.versions.length > 0) };
}

/** The latest published version of a pack with what one family gets. */
export async function getPack(slug: string) {
  const pack = await db.standardPack.findUnique({
    where: { slug },
    select: {
      slug: true,
      name: true,
      durationDays: true,
      active: true,
      company: { select: { slug: true, name: true, demo: true, category: { select: { slug: true, name: true } } } },
      versions: {
        ...latest,
        select: {
          id: true,
          pricePerFamily: true,
          groupSize: true,
          householdSize: true,
          items: { orderBy: { sortOrder: "asc" }, select: { name: true, size: true, qty: true } },
        },
      },
    },
  });
  if (!pack || !pack.active || pack.versions.length === 0) return null;
  const { versions, ...rest } = pack;
  return { ...rest, version: versions[0] };
}

/** Open groups for this exact pack version at this pickup point. No member data leaves here. */
export async function nearbyGroups(versionId: string, agentId: string) {
  const groups = await db.packGroup.findMany({
    where: {
      versionId,
      agentId,
      status: "OPEN",
      OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }],
    },
    orderBy: [{ joined: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      joined: true,
      closesAt: true,
      version: { select: { groupSize: true } },
      agent: { select: { city: true, address: true } },
    },
  });
  return groups.map((g) => ({
    id: g.id,
    joined: g.joined,
    size: g.version.groupSize,
    spotsLeft: g.version.groupSize - g.joined,
    closesAt: g.closesAt,
    pickup: g.agent.city ?? g.agent.address,
  }));
}

type Tx = Prisma.TransactionClient;

/** Takes one spot under a row lock on the group (PACK-002); the last spot marks it FULL. */
async function takeSpot(tx: Tx, userId: string, groupId: string) {
  const rows = await tx.$queryRaw<{ status: string; joined: number; closesAt: Date | null; groupSize: number }[]>`
    SELECT g."status", g."joined", g."closesAt", v."groupSize"
    FROM "PackGroup" g JOIN "PackVersion" v ON v."id" = g."versionId"
    WHERE g."id" = ${groupId}
    FOR UPDATE OF g`;
  const g = rows[0];
  if (!g) throw new AppError("This group no longer exists.");
  if (g.status !== "OPEN" || (g.closesAt && g.closesAt <= new Date())) {
    throw new AppError("This group is no longer taking families.");
  }
  if (g.joined >= g.groupSize) throw new AppError("This group is full.");
  const already = await tx.packMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { id: true },
  });
  if (already) throw new AppError("You are already in this group.");
  await tx.packMember.create({ data: { groupId, userId } });
  const joined = g.joined + 1;
  await tx.packGroup.update({
    where: { id: groupId },
    data: { joined, status: joined >= g.groupSize ? "FULL" : "OPEN" },
  });
  return { joined, size: g.groupSize };
}

export async function joinGroup(userId: string, groupId: string) {
  try {
    return await db.$transaction((tx) => takeSpot(tx, userId, groupId));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("You are already in this group.");
    }
    throw e;
  }
}

/** Starts a group at the buyer's pickup point and takes its first spot. */
export async function startGroup(userId: string, versionId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { pickupAgentId: true } });
  if (!user.pickupAgentId) throw new AppError("Choose your pickup point first.");
  const agentId = user.pickupAgentId;
  return db.$transaction(async (tx) => {
    const v = await tx.packVersion.findUnique({
      where: { id: versionId },
      select: { publishedAt: true, pack: { select: { active: true } } },
    });
    if (!v?.publishedAt || !v.pack.active) throw new AppError("This pack is not available.");
    const agent = await tx.agent.findUnique({ where: { id: agentId }, select: { status: true } });
    if (agent?.status !== "LIVE") throw new AppError("This pickup point is not open.");
    const group = await tx.packGroup.create({ data: { versionId, agentId, createdById: userId } });
    const spot = await takeSpot(tx, userId, group.id);
    return { groupId: group.id, ...spot };
  });
}

export async function setPickupPoint(userId: string, agentId: string) {
  const agent = await db.agent.findUnique({ where: { id: agentId }, select: { status: true } });
  if (agent?.status !== "LIVE") throw new AppError("This pickup point is not open.");
  await db.user.update({ where: { id: userId }, data: { pickupAgentId: agentId } });
}

export async function pickupPoints() {
  return db.agent.findMany({
    where: { status: "LIVE", user: { locked: false } },
    orderBy: [{ city: "asc" }, { address: "asc" }],
    select: { id: true, city: true, address: true },
  });
}

export async function myGroups(userId: string) {
  const rows = await db.packMember.findMany({
    where: { userId },
    orderBy: { joinedAt: "desc" },
    select: {
      joinedAt: true,
      group: {
        select: {
          id: true,
          status: true,
          joined: true,
          closesAt: true,
          agent: { select: { city: true, address: true } },
          version: {
            select: {
              groupSize: true,
              pricePerFamily: true,
              pack: { select: { slug: true, name: true, company: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  return rows.map(({ joinedAt, group: g }) => ({
    joinedAt,
    groupId: g.id,
    status: g.status,
    joined: g.joined,
    size: g.version.groupSize,
    closesAt: g.closesAt,
    price: g.version.pricePerFamily,
    pickup: g.agent.city ?? g.agent.address,
    packSlug: g.version.pack.slug,
    packName: g.version.pack.name,
    company: g.version.pack.company.name,
  }));
}
