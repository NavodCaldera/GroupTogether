import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { type OperationalAdminArea, userAdminArea } from "@/lib/admin-access";
import { AuthError } from "./auth/service";
import { db } from "./db";

/** The accounts an area manages: its own admins plus its stakeholders (see `userAdminArea`). */
export function areaUsersWhere(area: OperationalAdminArea): Prisma.UserWhereInput {
  const stakeholders: Record<OperationalAdminArea, Prisma.UserWhereInput[]> = {
    PREMIUM: [{ role: "SELLER", isBrand: true }],
    FACTORY: [{ role: "SELLER", isBrand: false }],
    WAREHOUSE: [{ role: "CUSTOMER" }, { role: "PACKER" }],
  };
  return { OR: [{ role: "ADMIN", adminArea: area }, ...stakeholders[area]] };
}

/** Throws unless the account belongs to this admin's area. */
export async function assertManagesUser(area: OperationalAdminArea, userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, isBrand: true, adminArea: true },
  });
  if (!user || userAdminArea(user) !== area) throw new AuthError("User not found");
}
