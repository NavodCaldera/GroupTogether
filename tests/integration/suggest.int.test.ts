import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { suggestProducts } from "@/server/catalogue";
import { makeVariant, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

describe("search suggestions", () => {
  it("matches live products by title or brand, prefix first, and ignores short input", async () => {
    const v = await makeVariant("1000", 5);
    await db.product.update({
      where: { id: v.productId },
      data: { title: "Velocity runner", brand: "Acme" },
    });
    expect((await suggestProducts("velo")).map((p) => p.title)).toEqual(["Velocity runner"]);
    expect(await suggestProducts("acm")).toHaveLength(1);
    expect(await suggestProducts("v")).toHaveLength(0);
    await db.product.update({ where: { id: v.productId }, data: { status: "DRAFT" } });
    expect(await suggestProducts("velo")).toHaveLength(0);
  });
});
