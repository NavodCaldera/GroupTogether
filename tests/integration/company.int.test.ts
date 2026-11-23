import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { publishPackVersion, replaceImage } from "@/server/company";
import { db } from "@/server/db";
import { resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

let n = 0;
async function company() {
  n++;
  const co = await db.company.create({
    data: { slug: `co-${n}`, name: `Co ${n}` },
  });
  const pack = await db.standardPack.create({
    data: { slug: `pk-${n}`, name: "Budget Pack", durationDays: 30, companyId: co.id },
  });
  await db.packVersion.create({
    data: {
      packId: pack.id,
      version: 1,
      publishedAt: new Date(),
      pricePerFamily: "1000.00",
      householdSize: 4,
      commissionPct: "10.00",
      items: { create: [{ name: "Milk", size: "1 l", qty: 2 }] },
    },
  });
  return { id: co.id, packId: pack.id };
}

const OFF = { discount5: "5", discount10: "10", discount15: "12.5" };

const NO_PHOTO = { retailPrice: "", photo: null, file: null };

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const file = (bytes: Uint8Array<ArrayBuffer>) => new File([bytes], "x.png", { type: "image/png" });

describe("company dashboard", () => {
  it("publishes a new version with new items and price, keeping size, household and commission", async () => {
    const c = await company();
    await publishPackVersion(c.id, c.packId, "1250.50", OFF, [
      { name: "Butter", size: "200 g", qty: 1, ...NO_PHOTO },
    ]);
    const versions = await db.packVersion.findMany({
      where: { packId: c.packId },
      orderBy: { version: "asc" },
      select: {
        version: true,
        pricePerFamily: true,
        discount5: true,
        discount10: true,
        discount15: true,
        householdSize: true,
        commissionPct: true,
        items: true,
      },
    });
    expect(versions).toHaveLength(2);
    expect(versions[0].pricePerFamily.toFixed(2)).toBe("1000.00");
    const v2 = versions[1];
    expect([
      v2.version,
      v2.pricePerFamily.toFixed(2),
      v2.discount15.toFixed(2),
      v2.householdSize,
      v2.commissionPct.toFixed(2),
    ]).toEqual([2, "1250.50", "12.50", 4, "10.00"]);
    expect(v2.items.map((i) => [i.name, i.qty])).toEqual([["Butter", 1]]);
  });

  it("refuses another company's pack, a bad price or discount and an empty pack", async () => {
    const a = await company();
    const b = await company();
    const item = [{ name: "Milk", size: "1 l", qty: 1, ...NO_PHOTO }];
    await expect(publishPackVersion(a.id, b.packId, "100", OFF, item)).rejects.toThrow(
      "Pack not found.",
    );
    await expect(publishPackVersion(a.id, a.packId, "0", OFF, item)).rejects.toThrow(
      "Enter a price above 0.",
    );
    await expect(publishPackVersion(a.id, a.packId, "12.345", OFF, item)).rejects.toThrow(
      "Enter a price above 0.",
    );
    await expect(publishPackVersion(a.id, a.packId, "100", OFF, [])).rejects.toThrow(
      "1 to 30 items",
    );
    await expect(
      publishPackVersion(a.id, a.packId, "100", { ...OFF, discount15: "95" }, item),
    ).rejects.toThrow("0 to 90%");
    expect(await db.packVersion.count({ where: { packId: { in: [a.packId, b.packId] } } })).toBe(2);
  });

  it("stores a real image, replaces the old one and refuses other files", async () => {
    const c = await company();
    await replaceImage(c.id, "logo", file(PNG));
    const first = (await db.company.findUniqueOrThrow({ where: { id: c.id } })).logo!;
    await replaceImage(c.id, "logo", file(PNG));
    const second = (await db.company.findUniqueOrThrow({ where: { id: c.id } })).logo!;
    expect(second).not.toBe(first);
    expect(await db.image.findMany({ select: { id: true } })).toEqual([{ id: second.slice(5) }]);

    await expect(
      replaceImage(c.id, "banner", file(new TextEncoder().encode("<svg/>"))),
    ).rejects.toThrow("PNG, JPEG or WebP");
    const other = await company();
    await expect(replaceImage(c.id, { packId: other.packId }, file(PNG))).rejects.toThrow(
      "Pack not found.",
    );
    expect(await db.image.count()).toBe(1);
  });

  it("saves each item's shop price and photo, keeps an existing photo and refuses another company's", async () => {
    const c = await company();
    const milk = { name: "Milk", size: "1 l", qty: 2 };
    await publishPackVersion(c.id, c.packId, "900", OFF, [
      { ...milk, retailPrice: "350.00", photo: null, file: file(PNG) },
    ]);
    const v2 = await db.packItem.findFirstOrThrow({ where: { version: { version: 2 } } });
    expect([v2.retailPrice?.toFixed(2), v2.photo?.startsWith("/img/")]).toEqual(["350.00", true]);

    await publishPackVersion(c.id, c.packId, "900", OFF, [
      { ...milk, retailPrice: "", photo: v2.photo, file: null },
    ]);
    const v3 = await db.packItem.findFirstOrThrow({ where: { version: { version: 3 } } });
    expect([v3.retailPrice, v3.photo]).toEqual([null, v2.photo]);

    const other = await company();
    await expect(
      publishPackVersion(other.id, other.packId, "900", OFF, [
        { ...milk, ...NO_PHOTO, photo: v2.photo },
      ]),
    ).rejects.toThrow("Photo not found.");
    await expect(
      publishPackVersion(c.id, c.packId, "900", OFF, [{ ...milk, ...NO_PHOTO, retailPrice: "-1" }]),
    ).rejects.toThrow("Shop prices must be above 0.");
  });
});
