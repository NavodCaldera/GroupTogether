import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/server/auth/session";
import { fitAccuracy, fitAwaitingCheck } from "@/server/fit";

export const metadata: Metadata = { title: "Fit" };

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "—");

/** Factory fit data to check, and how buyers say recommended sizes fitted (DEC-020). */
export default async function FitAdminPage() {
  await requireAdmin("FACTORY");
  const [toCheck, accuracy] = await Promise.all([fitAwaitingCheck(), fitAccuracy()]);
  return (
    <>
      <PageHeader title="Fit" />
      <section aria-labelledby="fit-check" className="mb-6 flex flex-col gap-2">
        <h2 id="fit-check" className="text-lg font-semibold">
          To check
        </h2>
        {toCheck.length ? (
          <Card>
            <ul className="flex flex-col divide-y divide-line">
              {toCheck.map((p) => (
                <li key={p.id} className="py-2 first:pt-0 last:pb-0">
                  <Link
                    href={`/admin/products/${p.id}`}
                    className="flex min-h-11 items-center justify-between gap-3"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">
                        {p.brand} {p.title}
                      </span>
                      <span className="block text-sm text-subtle">
                        {p.seller?.company || p.seller?.name || "Our own listing"}
                      </span>
                    </span>
                    <span aria-hidden>›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState title="Nothing to check" />
        )}
      </section>
      <section aria-labelledby="fit-accuracy" className="flex flex-col gap-2">
        <h2 id="fit-accuracy" className="text-lg font-semibold">
          How it fitted
        </h2>
        {accuracy.length ? (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-subtle">
                  <th scope="col" className="py-1 pr-2 font-normal">
                    Product
                  </th>
                  <th scope="col" className="px-2 py-1 text-right font-normal">
                    Answers
                  </th>
                  <th scope="col" className="px-2 py-1 text-right font-normal">
                    Good
                  </th>
                  <th scope="col" className="px-2 py-1 text-right font-normal">
                    Tight
                  </th>
                  <th scope="col" className="px-2 py-1 text-right font-normal">
                    Loose
                  </th>
                  <th scope="col" className="py-1 pl-2 text-right font-normal">
                    Good in our size
                  </th>
                </tr>
              </thead>
              <tbody>
                {accuracy.map((a) => (
                  <tr key={a.id} className="border-t border-line">
                    <td className="py-2 pr-2">
                      {a.brand} {a.title}
                    </td>
                    <td className="px-2 text-right">{a.total}</td>
                    <td className="px-2 text-right">{pct(a.good, a.total)}</td>
                    <td className="px-2 text-right">{pct(a.tight, a.total)}</td>
                    <td className="px-2 text-right">{pct(a.loose, a.total)}</td>
                    <td className="pl-2 text-right">
                      {pct(a.recommendedGood, a.recommendedBought)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <EmptyState title="No answers yet" />
        )}
      </section>
    </>
  );
}
