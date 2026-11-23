import "server-only";
import { notFound } from "next/navigation";
import { D } from "@/lib/decimal";
import { requireUser } from "./auth/session";
import { db } from "./db";
import { AppError } from "./errors";

/** The signed-in company login's company id; anyone else gets 404. */
export async function requireCompany() {
  const user = await requireUser("/company");
  if (!user.companyId) notFound();
  return user.companyId;
}

const MAX_IMAGE = 3 * 1024 * 1024;
const startsWith = (b: Uint8Array, bytes: number[], at = 0) =>
  bytes.every((x, i) => b[at + i] === x);
function imageType(b: Uint8Array) {
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8))
    return "image/webp";
  return null;
}

export type ImageTarget = "banner" | "logo" | { packId: string };

/** Stores an uploaded PNG, JPEG or WebP (3 MB at most) and points the banner, logo or pack photo at it. */
export async function replaceImage(
  companyId: string,
  target: ImageTarget,
  file: FormDataEntryValue | null,
) {
  if (!(file instanceof File) || file.size === 0) throw new AppError("Choose an image.");
  if (file.size > MAX_IMAGE) throw new AppError("The image must be 3 MB or smaller.");
  const data = new Uint8Array(await file.arrayBuffer());
  const type = imageType(data);
  if (!type) throw new AppError("Use a PNG, JPEG or WebP image.");

  await db.$transaction(async (tx) => {
    const { id } = await tx.image.create({ data: { companyId, type, data }, select: { id: true } });
    const url = `/img/${id}`;
    let old: string | null;
    if (typeof target === "string") {
      const c = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { banner: true, logo: true },
      });
      old = c[target];
      await tx.company.update({ where: { id: companyId }, data: { [target]: url } });
    } else {
      const p = await tx.standardPack.findFirst({
        where: { id: target.packId, companyId },
        select: { photo: true },
      });
      if (!p) throw new AppError("Pack not found.");
      old = p.photo;
      await tx.standardPack.update({ where: { id: target.packId }, data: { photo: url } });
    }
    if (old?.startsWith("/img/"))
      await tx.image.deleteMany({ where: { id: old.slice(5), companyId } });
  });
}

export type ItemInput = { name: string; size: string; qty: number };
/** Discount % for baskets of 5, 10 and 15 families. */
export type DiscountInput = { discount5: string; discount10: string; discount15: string };

/** Publishes a new version with new items, price and discounts; baskets already started keep theirs. */
export async function publishPackVersion(
  companyId: string,
  packId: string,
  price: string,
  discounts: DiscountInput,
  items: ItemInput[],
) {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(price) || new D(price).lte(0))
    throw new AppError("Enter a price above 0.");
  for (const pct of Object.values(discounts))
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(pct) || new D(pct).gt(90))
      throw new AppError("Discounts are 0 to 90%.");
  if (items.length === 0 || items.length > 30) throw new AppError("A pack needs 1 to 30 items.");
  for (const i of items) {
    if (!i.name || i.name.length > 80 || i.size.length > 30)
      throw new AppError("Every item needs a name.");
    if (!Number.isInteger(i.qty) || i.qty < 1 || i.qty > 99)
      throw new AppError("Quantities are 1 to 99.");
  }
  await db.$transaction(async (tx) => {
    const pack = await tx.standardPack.findFirst({
      where: { id: packId, companyId },
      select: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          select: { version: true, householdSize: true, commissionPct: true },
        },
      },
    });
    const v = pack?.versions[0];
    if (!v) throw new AppError("Pack not found.");
    await tx.packVersion.create({
      data: {
        packId,
        version: v.version + 1,
        publishedAt: new Date(),
        pricePerFamily: price,
        ...discounts,
        householdSize: v.householdSize,
        commissionPct: v.commissionPct,
        items: { create: items.map((i, sortOrder) => ({ ...i, sortOrder })) },
      },
    });
  });
}

/** Everything the company dashboard shows: brand, packs at their latest version, and orders. */
export function companyDashboard(companyId: string) {
  return db.company.findUniqueOrThrow({
    where: { id: companyId },
    select: {
      slug: true,
      name: true,
      logo: true,
      banner: true,
      packs: {
        where: { active: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          photo: true,
          versions: {
            where: { publishedAt: { not: null } },
            orderBy: { version: "desc" },
            take: 1,
            select: {
              version: true,
              pricePerFamily: true,
              discount5: true,
              discount10: true,
              discount15: true,
              items: {
                orderBy: { sortOrder: "asc" },
                select: { name: true, size: true, qty: true },
              },
            },
          },
        },
      },
      deliveries: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          families: true,
          amountDue: true,
          status: true,
          createdAt: true,
          group: {
            select: {
              address: true,
              city: true,
              createdBy: { select: { name: true, phone: true } },
              version: { select: { pack: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
}
