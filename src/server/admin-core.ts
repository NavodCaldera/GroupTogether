import "server-only";
import { D, toD } from "@/lib/decimal";
import { assertAdminArea } from "./auth/service";
import { CartError } from "@/server/errors";
import { db } from "./db";
import { tokenBalance } from "./tokens";

async function requireCore(adminId: string) {
  try {
    await assertAdminArea(adminId, "CORE");
  } catch {
    throw new CartError("Not allowed");
  }
}

/** Weekly factory payouts: unpaid drafts oldest first, then the latest paid ones. */
export async function adminPayouts(adminId: string) {
  await requireCore(adminId);
  const select = {
    id: true,
    weekEnding: true,
    gross: true,
    deductions: true,
    net: true,
    bankRef: true,
    paidAt: true,
    factory: { select: { name: true, company: true } },
    _count: { select: { items: true } },
  } as const;
  const [drafts, paid] = await Promise.all([
    db.factoryPayout.findMany({
      where: { paidAt: null },
      orderBy: [{ weekEnding: "asc" }, { factoryId: "asc" }],
      select,
    }),
    db.factoryPayout.findMany({
      where: { paidAt: { not: null } },
      orderBy: { paidAt: "desc" },
      take: 30,
      select,
    }),
  ]);
  return { drafts, paid };
}

/** Tokens issued (credits) and taken (debits) across all users, by kind. */
export async function tokensByKind(adminId: string) {
  await requireCore(adminId);
  const rows = await db.tokenEntry.groupBy({
    by: ["kind"],
    _sum: { amount: true },
    _count: true,
    orderBy: { kind: "asc" },
  });
  return rows.map((r) => ({
    kind: r.kind,
    count: r._count,
    total: r._sum.amount === null ? new D(0) : toD(r._sum.amount),
  }));
}

/** A user found by email or phone, with their token balance and latest entries. */
export async function tokenLookup(adminId: string, raw: string) {
  await requireCore(adminId);
  const q = raw.trim();
  if (!q) return null;
  const user = await db.user.findFirst({
    where: q.includes("@")
      ? { email: { equals: q, mode: "insensitive" } }
      : { phone: q.replace(/[\s-]/g, "") },
    select: { id: true, name: true, email: true, phone: true, role: true },
  });
  if (!user) return null;
  const [balance, entries] = await Promise.all([
    tokenBalance(user.id),
    db.tokenEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, amount: true, kind: true, note: true, createdAt: true },
    }),
  ]);
  return { user, balance, entries };
}
