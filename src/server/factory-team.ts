import "server-only";
import { z } from "zod";
import type { FactoryRole } from "@/generated/prisma/client";
import { FACTORY_ROLES } from "@/lib/factory-roles";
import { hashPassword } from "./auth/password";
import { phoneSchema } from "./auth/service";
import { db } from "./db";

/**
 * Factory staff (product owner, 2026-11-04): an owner adds each person with their own login and a
 * fixed job, changes the job, and locks someone who leaves. The factory account itself is always
 * an owner and can't be changed or locked from here.
 */
export class TeamError extends Error {}

export const staffSchema = z.object({
  name: z.string().trim().min(2, "Enter their name").max(80),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  phone: z.union([z.literal("").transform(() => null), phoneSchema]),
  role: z.enum(FACTORY_ROLES as [FactoryRole, ...FactoryRole[]]),
  password: z.string().min(8, "Use at least 8 characters"),
});

export async function factoryTeam(factoryId: string) {
  return db.user.findMany({
    where: { factoryId },
    orderBy: [{ locked: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, email: true, factoryRole: true, locked: true },
  });
}

/** Orders each person packed in the last seven days, by their user id. */
export async function packedThisWeek(factoryId: string, now = new Date()) {
  const rows = await db.groupCart.groupBy({
    by: ["factoryPackedById"],
    where: {
      factoryPackedAt: { gte: new Date(now.getTime() - 7 * 86_400_000) },
      factoryPackedBy: { OR: [{ id: factoryId }, { factoryId }] },
    },
    _count: true,
  });
  return new Map(rows.map((r) => [r.factoryPackedById, r._count]));
}

export async function addStaff(factoryId: string, raw: unknown) {
  const input = staffSchema.parse(raw);
  const clash = await db.user.findFirst({
    where: { OR: [{ email: input.email }, ...(input.phone ? [{ phone: input.phone }] : [])] },
    select: { email: true },
  });
  if (clash)
    throw new TeamError(
      clash.email === input.email
        ? "Another account uses this email"
        : "Another account uses this mobile number",
    );
  const factory = await db.user.findFirst({
    where: { id: factoryId, role: "SELLER", isBrand: false, factoryId: null },
    select: { company: true, city: true },
  });
  if (!factory) throw new TeamError("Factory not found");
  return db.user.create({
    data: {
      role: "SELLER",
      factoryId,
      factoryRole: input.role,
      name: input.name,
      email: input.email,
      phone: input.phone,
      company: factory.company,
      city: factory.city,
      passwordHash: await hashPassword(input.password),
    },
    select: { id: true },
  });
}

async function ownStaff(factoryId: string, staffId: string) {
  const s = await db.user.findFirst({ where: { id: staffId, factoryId }, select: { id: true } });
  if (!s) throw new TeamError("Staff member not found");
}

export async function setStaffRole(factoryId: string, staffId: string, role: FactoryRole) {
  if (!FACTORY_ROLES.includes(role)) throw new TeamError("Choose a job");
  await ownStaff(factoryId, staffId);
  await db.user.update({ where: { id: staffId }, data: { factoryRole: role } });
}

/** A locked person can't sign in, and locking ends their sessions at once. */
export async function setStaffLocked(
  factoryId: string,
  staffId: string,
  locked: boolean,
  byId: string,
) {
  if (staffId === byId) throw new TeamError("You can't lock your own login");
  await ownStaff(factoryId, staffId);
  await db.$transaction([
    db.user.update({ where: { id: staffId }, data: { locked } }),
    ...(locked ? [db.session.deleteMany({ where: { userId: staffId } })] : []),
  ]);
}
