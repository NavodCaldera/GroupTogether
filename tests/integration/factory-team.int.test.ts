import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { addStaff, factoryTeam, setStaffLocked, setStaffRole } from "@/server/factory-team";
import { makeUser, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});
afterAll(() => db.$disconnect());

async function factory() {
  return db.user.update({
    where: { id: (await makeUser()).id },
    // Existing-factory fixture explicitly represents the migration's 30-day grace.
    data: {
      role: "SELLER",
      company: "Lanka Knits",
      city: "Kandy",
      factoryProfile: { create: { complianceDueAt: new Date(Date.now() + 30 * 86400000) } },
    },
  });
}

const staff = (email: string, role = "PACKING") => ({
  name: "Ruwan Perera",
  email,
  phone: "",
  role,
  password: "password123",
});

describe("factory staff (2026-11-04)", () => {
  it("adds staff with their own login and job, only to a factory account", async () => {
    const f = await factory();
    const s = await addStaff(f.id, staff("ruwan@example.com"));
    const row = await db.user.findUniqueOrThrow({ where: { id: s.id } });
    expect(row).toMatchObject({ role: "SELLER", factoryId: f.id, factoryRole: "PACKING" });
    expect(row.company).toBe("Lanka Knits");
    await expect(addStaff(f.id, staff("RUWAN@example.com"))).rejects.toThrow("email");
    await expect(addStaff(s.id, staff("x@example.com"))).rejects.toThrow("Factory not found");
  });

  it("changes jobs and locks only its own staff, never the person doing it", async () => {
    const [f, other] = [await factory(), await factory()];
    const s = await addStaff(f.id, staff("a@example.com"));
    await setStaffRole(f.id, s.id, "SALES");
    await expect(setStaffRole(other.id, s.id, "OWNER")).rejects.toThrow("not found");
    await db.session.create({
      data: { id: "t", userId: s.id, expiresAt: new Date(Date.now() + 1e6) },
    });
    await setStaffLocked(f.id, s.id, true, f.id);
    expect(await db.session.count({ where: { userId: s.id } })).toBe(0);
    await expect(setStaffLocked(f.id, s.id, false, s.id)).rejects.toThrow("own login");
    expect((await factoryTeam(f.id))[0]).toMatchObject({ factoryRole: "SALES", locked: true });
  });
});
