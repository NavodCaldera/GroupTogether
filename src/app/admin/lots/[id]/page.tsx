import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BackLink } from "@/components/client";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatDate, formatLKR } from "@/lib/format";
import { priceAtMargin } from "@/lib/stock-rules";
import { requireAdmin } from "@/server/auth/session";
import { sweep } from "@/server/carts/service";
import { db } from "@/server/db";
import { storeSnapshot } from "@/server/stock";
import { Table } from "../../list-bits";
import { pcs } from "../../stock-charts";
import { LotForm } from "../lot-form";

export const metadata: Metadata = { title: "Lot" };

const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

export default async function LotPage({ params }: PageProps<"/admin/lots/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const now = new Date();
  await sweep(now);
  const lot = await db.lot.findUnique({ where: { id } });
  if (!lot) notFound();
  const snap = await storeSnapshot(now);
  const l = snap.lots.find((x) => x.id === id)!;
  const products = snap.products.filter((p) => p.lot?.id === id);
  const full = now < l.reduceAt;

  return (
    <>
      <BackLink fallback="/admin/lots" />
      <PageHeader
        title={l.name}
        actions={
          <Link
            href={`/admin/products/new?lot=${l.id}`}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent"
          >
            Add product
          </Link>
        }
      />
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
            <Card className="text-sm">
              <h2 className="mb-2 font-semibold">Cost and price</h2>
              <Rows
                rows={[
                  ["Total cost", <strong key="t">{formatLKR(l.totalCost)}</strong>],
                  ["Cost / piece", formatLKR(l.costPerPiece)],
                  [
                    `+${l.fullMarginPct}% until ${formatDate(l.reduceAt)}`,
                    <PriceNow key="f" now={full}>
                      {formatLKR(priceAtMargin(l.costPerPiece, l.fullMarginPct))}
                    </PriceNow>,
                  ],
                  [
                    `+${l.reducedMarginPct}% from ${formatDate(l.reduceAt)}`,
                    <PriceNow key="r" now={!full}>
                      {formatLKR(priceAtMargin(l.costPerPiece, l.reducedMarginPct))}
                    </PriceNow>,
                  ],
                ]}
              />
            </Card>
            <Card className="text-sm">
              <h2 className="mb-2 font-semibold">Pieces</h2>
              <Rows
                rows={[
                  ["Arrived", `${formatDate(l.receivedAt)} · ${l.days}d ago`],
                  ["Bought", pcs(l.pieces)],
                  ["Not listed", pcs(l.unlisted)],
                  ["In store", pcs(l.inStore)],
                  ["Sold", `${pcs(l.sold)} · ${pct(l.soldPct)}`],
                  ["Sales", formatLKR(l.revenue)],
                  ["Cost back", <strong key="c">{pct(l.costBackPct)}</strong>],
                ]}
              />
            </Card>
          </div>

          <section>
            <h2 className="mb-2 font-semibold">Products</h2>
            {products.length === 0 ? (
              <Card className="text-sm text-subtle">None</Card>
            ) : (
              <Table
                head={
                  <>
                    <th>Product</th>
                    <th className="text-right">Free</th>
                    <th className="text-right">In carts</th>
                    <th className="text-right">Sold</th>
                    <th className="text-right">Price</th>
                  </>
                }
              >
                {products.map((p) => (
                  <tr key={p.id}>
                    <td className="max-w-64 truncate">
                      <Link href={`/admin/products/${p.id}`} className="hover:underline">
                        {p.brand} {p.title}
                      </Link>
                    </td>
                    <td className="text-right tabular-nums">{p.free}</td>
                    <td className="text-right tabular-nums">{p.inCarts}</td>
                    <td className="text-right tabular-nums">{p.sold}</td>
                    <td className="text-right">{formatLKR(p.price)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
        </div>

        <Card>
          <h2 className="mb-3 font-semibold">Edit lot</h2>
          <LotForm lot={lot} />
        </Card>
      </div>
    </>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="flex flex-col gap-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3">
          <dt className="text-subtle">{label}</dt>
          <dd className="text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PriceNow({ now, children }: { now: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {now && <Badge tone="info">Now</Badge>}
      <span className={now ? "font-semibold" : "text-subtle"}>{children}</span>
    </span>
  );
}
