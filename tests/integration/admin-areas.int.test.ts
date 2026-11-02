import { afterAll, beforeEach, expect, it } from "vitest";
import {
  assertAdminArea,
  createOperationalAdmin,
  startSession,
  userForToken,
} from "@/server/auth/service";
import { db } from "@/server/db";
import { assertManagesUser, areaUsersWhere } from "@/server/admin-users";
import { makeUser, resetDb } from "./helpers";
beforeEach(resetDb);
afterAll(() => db.$disconnect());
it("loads stored scope into sessions and denies other operational services", async () => {
  const admin = await makeUser("ADMIN");
  await db.user.update({ where: { id: admin.id }, data: { adminArea: "FACTORY" } });
  const { token } = await startSession(admin.id);
  expect(await userForToken(token)).toMatchObject({ adminArea: "FACTORY" });
  await expect(assertAdminArea(admin.id, "FACTORY")).resolves.toBeUndefined();
  await expect(assertAdminArea(admin.id, "PREMIUM")).rejects.toThrow("unavailable");
  await expect(assertAdminArea(admin.id, "WAREHOUSE")).rejects.toThrow("unavailable");
});
it("provisions operational accounts without allowing unrestricted scope", async () => {
  const input = {
    name: "Warehouse Admin",
    email: "warehouse@test.lk",
    phone: "0771234567",
    password: "test-password",
    adminArea: "WAREHOUSE",
  };
  expect(await createOperationalAdmin(input)).toMatchObject({
    role: "ADMIN",
    adminArea: "WAREHOUSE",
  });
  await expect(createOperationalAdmin({ ...input, adminArea: "ALL" })).rejects.toThrow();
});
it("limits each area to its own admins and stakeholder accounts", async () => {
  const [premium, factory, warehouse, buyer, packer] = [
    await makeUser("ADMIN", "PREMIUM"),
    await makeUser("ADMIN", "FACTORY"),
    await makeUser("ADMIN", "WAREHOUSE"),
    await makeUser(),
    await makeUser("PACKER"),
  ];
  const seller = await db.user.update({
    where: { id: (await makeUser()).id },
    data: { role: "SELLER", isBrand: false, company: "Factory" },
  });
  const brand = await db.user.update({
    where: { id: (await makeUser()).id },
    data: { role: "SELLER", isBrand: true, company: "Brand", website: "https://brand.example" },
  });
  const visible = async (area: "PREMIUM" | "FACTORY" | "WAREHOUSE") =>
    (await db.user.findMany({ where: areaUsersWhere(area), select: { id: true } }))
      .map((u) => u.id)
      .sort();
  expect(await visible("PREMIUM")).toEqual([premium.id, brand.id].sort());
  expect(await visible("FACTORY")).toEqual([factory.id, seller.id].sort());
  expect(await visible("WAREHOUSE")).toEqual([warehouse.id, buyer.id, packer.id].sort());
  await expect(assertManagesUser("WAREHOUSE", buyer.id)).resolves.toBeUndefined();
  await expect(assertManagesUser("FACTORY", buyer.id)).rejects.toThrow("not found");
  await expect(assertManagesUser("PREMIUM", seller.id)).rejects.toThrow("not found");
  await expect(assertManagesUser("FACTORY", premium.id)).rejects.toThrow("not found");
});
