import { toCsv } from "@/lib/csv";
import { toD } from "@/lib/decimal";
import { colomboDayStart, formatIsoDateTime } from "@/lib/format";
import { namesList } from "@/lib/packing-rules";
import { PAID } from "@/server/admin-queries";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { packingSelect } from "@/server/packing";

/** Confirmed orders of the last `days` days (Colombo days, default 30) as CSV, for the books. */
export async function GET(req: Request) {
  await requireAdmin();
  const asked = Number(new URL(req.url).searchParams.get("days"));
  const days = Number.isInteger(asked) && asked >= 1 && asked <= 366 ? asked : 30;
  const now = new Date();
  const carts = await db.groupCart.findMany({
    where: { status: { in: PAID }, confirmedAt: { gte: colomboDayStart(now, days - 1) } },
    select: {
      code: true,
      name: true,
      status: true,
      confirmedAt: true,
      total: true,
      deliveryCity: true,
      owner: { select: { name: true, email: true, phone: true } },
      lines: { select: { qty: true } },
      _count: { select: { members: true } },
      packing: { select: packingSelect },
    },
    orderBy: { confirmedAt: "asc" },
  });
  const rows = [
    [
      "Cart",
      "Name",
      "Status",
      "Confirmed (Colombo)",
      "Owner",
      "Email",
      "Mobile",
      "City",
      "Members",
      "Items",
      "Total (LKR)",
      "Packed by",
      "Checked by",
      "Handed to PickMe by",
    ],
    ...carts.map((c) => [
      c.code,
      c.name,
      c.status,
      formatIsoDateTime(c.confirmedAt),
      c.owner.name,
      c.owner.email,
      c.owner.phone,
      c.deliveryCity,
      c._count.members,
      c.lines.reduce((n, l) => n + l.qty, 0),
      toD(c.total).toFixed(2),
      c.packing?.packedBy.name ?? "",
      namesList(c.packing?.checks.map((k) => k.user.name) ?? []),
      c.packing?.handedOverBy?.name ?? "",
    ]),
  ];
  const day = formatIsoDateTime(now).slice(0, 10);
  // The BOM makes Excel read the file as UTF-8.
  return new Response(`﻿${toCsv(rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="grouptogether-orders-${day}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
