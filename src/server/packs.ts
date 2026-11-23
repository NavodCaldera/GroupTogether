import "server-only";
import { distanceKm } from "@/lib/distance";
import { db } from "./db";

/** Family packs (DEC-030): categories → companies → standard packs → open baskets. */

const published = { publishedAt: { not: null } } as const;
const livePack = { active: true, versions: { some: published } } as const;

/** Home: every category that has a company with a published pack, companies under each. */
export async function homeCategories() {
  return db.category.findMany({
    where: { active: true, companies: { some: { active: true, packs: { some: livePack } } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      slug: true,
      name: true,
      companies: {
        where: { active: true, packs: { some: livePack } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { slug: true, name: true, logo: true },
      },
    },
  });
}

const latest = { where: published, orderBy: { version: "desc" }, take: 1 } as const;

/** A company page: brand, family packs bought so far, and its standard packs at their latest version. */
export async function getCompany(slug: string) {
  const company = await db.company.findFirst({
    where: { slug, active: true },
    select: {
      id: true,
      slug: true,
      name: true,
      logo: true,
      banner: true,
      category: { select: { name: true } },
    },
  });
  if (!company) return null;
  // Paid spots in baskets that were not refunded.
  const [bought, packs] = await Promise.all([
    db.packMember.count({
      where: {
        status: "PAID",
        group: { status: { not: "CLOSED" }, version: { pack: { companyId: company.id } } },
      },
    }),
    db.standardPack.findMany({
      where: { companyId: company.id, ...livePack },
      orderBy: [{ durationDays: "asc" }, { name: "asc" }],
      select: {
        slug: true,
        name: true,
        durationDays: true,
        photo: true,
        versions: {
          ...latest,
          select: {
            pricePerFamily: true,
            groupSize: true,
            householdSize: true,
            _count: { select: { items: true } },
          },
        },
      },
    }),
  ]);
  return {
    ...company,
    bought,
    packs: packs.map(({ versions: [v], ...p }) => ({
      ...p,
      price: v.pricePerFamily,
      families: v.groupSize,
      householdSize: v.householdSize,
      items: v._count.items,
    })),
  };
}

/** One pack at its latest published version, with what one family gets. */
export async function getPack(slug: string) {
  const pack = await db.standardPack.findFirst({
    where: { slug, ...livePack, company: { active: true } },
    select: {
      slug: true,
      name: true,
      durationDays: true,
      photo: true,
      company: { select: { slug: true, name: true } },
      versions: {
        ...latest,
        select: {
          id: true,
          pricePerFamily: true,
          groupSize: true,
          householdSize: true,
          items: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, name: true, size: true, qty: true },
          },
        },
      },
    },
  });
  if (!pack) return null;
  const { versions, ...rest } = pack;
  return { ...rest, version: versions[0] };
}

export const NEARBY_KM = 1;

/**
 * Open baskets within 1 km of the viewer (AD-4): contacts' baskets first, then closest first.
 * Returns counts and area only; no member or owner details (AD-9).
 */
export async function openBaskets(
  viewer: { id: string; lat: number | null; lng: number | null },
  filter: { companySlug?: string; categorySlug?: string } = {},
) {
  if (viewer.lat == null || viewer.lng == null) return null;
  const here = { lat: viewer.lat, lng: viewer.lng };
  const dLat = 0.0095;
  const dLng = dLat / Math.max(0.1, Math.cos((here.lat * Math.PI) / 180));
  const [rows, contacts] = await Promise.all([
    db.packGroup.findMany({
      where: {
        status: "OPEN",
        closesAt: { gt: new Date() },
        lat: { gte: here.lat - dLat, lte: here.lat + dLat },
        lng: { gte: here.lng - dLng, lte: here.lng + dLng },
        version: {
          pack: {
            active: true,
            company: {
              active: true,
              ...(filter.companySlug ? { slug: filter.companySlug } : {}),
              ...(filter.categorySlug ? { category: { slug: filter.categorySlug } } : {}),
            },
          },
        },
      },
      select: {
        id: true,
        lat: true,
        lng: true,
        city: true,
        joined: true,
        closesAt: true,
        createdBy: { select: { phone: true } },
        members: { where: { userId: viewer.id }, select: { id: true } },
        version: {
          select: {
            groupSize: true,
            pricePerFamily: true,
            pack: {
              select: { slug: true, name: true, company: { select: { slug: true, name: true } } },
            },
          },
        },
      },
    }),
    db.userContact.findMany({ where: { userId: viewer.id }, select: { phone: true } }),
  ]);
  const known = new Set(contacts.map((c) => c.phone));
  return rows
    .map((g) => ({
      id: g.id,
      distanceKm: distanceKm(here, g),
      city: g.city,
      joined: g.joined,
      size: g.version.groupSize,
      spotsLeft: g.version.groupSize - g.joined,
      closesAt: g.closesAt,
      price: g.version.pricePerFamily,
      packSlug: g.version.pack.slug,
      packName: g.version.pack.name,
      companySlug: g.version.pack.company.slug,
      companyName: g.version.pack.company.name,
      fromContact: !!g.createdBy.phone && known.has(g.createdBy.phone),
      mine: g.members.length > 0,
    }))
    .filter((g) => g.distanceKm <= NEARBY_KM && g.spotsLeft > 0)
    .sort((a, b) => Number(b.fromContact) - Number(a.fromContact) || a.distanceKm - b.distanceKm);
}

/** One basket for its page: the pack, progress and the viewer's place in it. */
export async function getBasket(
  id: string,
  viewer: { id: string; lat: number | null; lng: number | null } | null,
) {
  const g = await db.packGroup.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      joined: true,
      closesAt: true,
      lat: true,
      lng: true,
      city: true,
      createdById: true,
      version: {
        select: {
          groupSize: true,
          pricePerFamily: true,
          householdSize: true,
          items: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, name: true, size: true, qty: true },
          },
          pack: {
            select: {
              slug: true,
              name: true,
              durationDays: true,
              company: { select: { slug: true, name: true } },
            },
          },
        },
      },
    },
  });
  // A basket nobody has paid for yet is invisible to everyone but its starter (AD-3).
  if (!g || (g.status === "PENDING" && g.createdById !== viewer?.id)) return null;
  const me = viewer
    ? await db.packMember.findUnique({
        where: { groupId_userId: { groupId: id, userId: viewer.id } },
        select: { status: true },
      })
    : null;
  const km =
    viewer?.lat != null && viewer.lng != null
      ? distanceKm({ lat: viewer.lat, lng: viewer.lng }, g)
      : null;
  return {
    id: g.id,
    status: g.status,
    joined: g.joined,
    size: g.version.groupSize,
    closesAt: g.closesAt,
    city: g.city,
    distanceKm: km,
    price: g.version.pricePerFamily,
    householdSize: g.version.householdSize,
    items: g.version.items,
    pack: g.version.pack,
    isOwner: viewer?.id === g.createdById,
    myStatus: me?.status ?? null,
    joinable:
      g.status === "OPEN" &&
      g.closesAt > new Date() &&
      g.joined < g.version.groupSize &&
      !me &&
      km !== null &&
      km <= NEARBY_KM,
  };
}
