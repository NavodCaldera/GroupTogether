import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { type CartStatus, STATUS_LABEL } from "@/lib/cart-rules";
import { requireAdmin } from "@/server/auth/session";
import { sweep } from "@/server/carts/service";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminHome() {
  await requireAdmin();
  await sweep();
  const [byStatus, pendingSlips, lowStock] = await Promise.all([
    db.groupCart.groupBy({ by: ["status"], _count: true }),
    db.paymentSlip.count({ where: { status: "PENDING" } }),
    db.variant.count({ where: { available: { lte: 2 }, product: { status: "LIVE" } } }),
  ]);
  const count = (s: CartStatus) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const tiles: [string, number, string][] = [
    ["Slips to review", pendingSlips, "/admin/slips"],
    ["Confirmed, to dispatch", count("CONFIRMED"), "/admin/carts?status=CONFIRMED"],
    ["Awaiting owner's slip", count("AWAITING_SLIP"), "/admin/carts?status=AWAITING_SLIP"],
    ["Reached minimum", count("READY"), "/admin/carts?status=READY"],
    ["Open carts", count("OPEN"), "/admin/carts?status=OPEN"],
    ["Sizes with ≤ 2 left", lowStock, "/admin/products"],
  ];
  return (
    <>
      <PageHeader title="Overview" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {tiles.map(([label, n, href]) => (
          <Link key={label} href={href}>
            <Card className="hover:border-accent">
              <p className="text-3xl font-bold">{n}</p>
              <p className="mt-1 text-sm text-subtle">{label}</p>
            </Card>
          </Link>
        ))}
      </div>
      <p className="text-xs text-subtle">
        {(["DISPATCHED", "DELIVERED", "EXPIRED", "CANCELLED"] as const)
          .map((s) => `${STATUS_LABEL[s]}: ${count(s)}`)
          .join(" · ")}
      </p>
    </>
  );
}
