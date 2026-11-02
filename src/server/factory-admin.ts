import "server-only";
import { requireAdmin } from "./auth/session";
import { db } from "./db";

/** Factory procurement queues, including the warehouse receipt handoff. */
export async function factoryDashboard() {
  await requireAdmin("FACTORY");
  const factory = { seller: { isBrand: false } };
  const [review, incoming, received, factories, incomingCount, receivedCount] = await Promise.all([
    db.stockOffer.count({ where: { ...factory, status: "IN_REVIEW" } }),
    db.stockOffer.findMany({
      where: { ...factory, status: "ACCEPTED", receivedAt: null },
      select: {
        id: true,
        name: true,
        kind: true,
        decidedAt: true,
        seller: { select: { name: true, company: true, phone: true, city: true } },
      },
      orderBy: { decidedAt: "asc" },
      take: 100,
    }),
    db.stockOffer.findMany({
      where: { ...factory, status: "ACCEPTED", receivedAt: { not: null }, productId: null },
      select: {
        id: true,
        name: true,
        receivedAt: true,
        seller: { select: { name: true, company: true } },
        receivedBy: { select: { name: true } },
      },
      orderBy: { receivedAt: "asc" },
      take: 100,
    }),
    db.user.count({ where: { role: "SELLER", isBrand: false, locked: false } }),
    db.stockOffer.count({ where: { ...factory, status: "ACCEPTED", receivedAt: null } }),
    db.stockOffer.count({
      where: { ...factory, status: "ACCEPTED", receivedAt: { not: null }, productId: null },
    }),
  ]);
  const sampleDemand = await db.sampleRequest.groupBy({
    by: ["productId", "status"],
    where: { status: { in: ["REQUESTED", "QUOTED", "ACCEPTED", "DISPATCHED"] } },
    _count: { _all: true },
    orderBy: { productId: "asc" },
    take: 100,
  });
  const designs = await db.product.findMany({
    where: { id: { in: [...new Set(sampleDemand.map((r) => r.productId))] } },
    select: { id: true, title: true },
  });
  const titles = new Map(designs.map((p) => [p.id, p.title]));
  const samples = sampleDemand.map((r) => ({
    productId: r.productId,
    title: titles.get(r.productId) ?? "Design",
    status: r.status,
    groups: r._count._all,
  }));
  return { review, incoming, received, factories, incomingCount, receivedCount, samples };
}
