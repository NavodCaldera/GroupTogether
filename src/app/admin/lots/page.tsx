import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatLKR } from "@/lib/format";
import { SLOW_DAYS } from "@/lib/stock-rules";
import { requireAdmin } from "@/server/auth/session";
import { sweep } from "@/server/carts/service";
import { storeSnapshot } from "@/server/stock";
import { Table } from "../list-bits";
import { pcs } from "../stock-charts";

export const metadata: Metadata = { title: "Lots" };

const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

/** Every bulk lot, newest arrival first (product owner, 2026-10-21). */
export default async function LotsPage() {
  await requireAdmin("FACTORY");
  const now = new Date();
  await sweep(now);
  const { lots } = await storeSnapshot(now);

  return (
    <>
      <PageHeader
        title="Lots"
        actions={
          <Link
            href="/admin/lots/new"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent"
          >
            Add lot
          </Link>
        }
      />
      {lots.length === 0 ? (
        <EmptyState title="No lots yet" />
      ) : (
        <Table
          head={
            <>
              <th>Lot</th>
              <th>Arrived</th>
              <th className="text-right">Days</th>
              <th className="text-right">Pieces</th>
              <th className="text-right">Cost / pc</th>
              <th className="text-right">Price</th>
              <th className="text-right">In store</th>
              <th className="text-right">Sold</th>
              <th className="text-right">Cost back</th>
            </>
          }
        >
          {lots.map((l) => (
            <tr key={l.id}>
              <td className="max-w-56 truncate">
                <Link href={`/admin/lots/${l.id}`} className="font-medium hover:underline">
                  {l.name}
                </Link>
              </td>
              <td>{formatDate(l.receivedAt)}</td>
              <td
                className={`text-right tabular-nums ${l.inStore > 0 && l.days > SLOW_DAYS ? "font-semibold text-danger" : ""}`}
              >
                {l.days}
              </td>
              <td className="text-right tabular-nums">{l.pieces.toLocaleString("en-LK")}</td>
              <td className="text-right">{formatLKR(l.costPerPiece)}</td>
              <td className="text-right">
                <span className="inline-flex items-center gap-1.5">
                  {formatLKR(l.priceNow)} <Badge tone="info">{l.marginPct}%</Badge>
                </span>
              </td>
              <td className="text-right tabular-nums">{pcs(l.inStore)}</td>
              <td className="text-right tabular-nums">{pct(l.soldPct)}</td>
              <td className="text-right tabular-nums">{pct(l.costBackPct)}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
