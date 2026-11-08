import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { factoryDashboard } from "@/server/factory-admin";
import { requireAdmin } from "@/server/auth/session";
import { pendingMissingReports } from "@/server/orders/delivery";

export const metadata: Metadata = { title: "Apparel and factories" };

export default async function FactoryAdminPage() {
  const admin = await requireAdmin("FACTORY");
  const [d, missing] = await Promise.all([factoryDashboard(), pendingMissingReports(admin.id)]);
  return (
    <>
      <PageHeader
        title="Apparel and factories"
        actions={<LinkButton href="/admin/offers">Review offers</LinkButton>}
      />
      {missing.length > 0 && (
        <Link
          href="/admin/factory/missing"
          className="mb-5 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-danger px-4 py-3 font-semibold"
        >
          <span>Missing items</span>
          <Badge tone="bad">{missing.length}</Badge>
        </Link>
      )}
      <Card>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["Offers to review", d.review],
            ["Awaiting warehouse receipt", d.incomingCount],
            ["Received, awaiting listing", d.receivedCount],
            ["Active factories", d.factories],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-subtle">{label}</dt>
              <dd className="text-xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <LinkButton href="/admin/products" variant="secondary">
            Designs and stock
          </LinkButton>
          <LinkButton href="/admin/lots" variant="secondary">
            Purchased lots
          </LinkButton>
        </div>
      </Card>
      <section>
        <h2 className="mb-3 font-semibold">Active sample demand by design</h2>
        {d.samples.length === 0 ? (
          <EmptyState title="No active sample requests" />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {d.samples.map((s) => (
              <li key={`${s.productId}-${s.status}`}>
                <Card className="text-sm">
                  <Link
                    href={`/admin/products/${s.productId}`}
                    className="font-semibold text-accent underline"
                  >
                    {s.title}
                  </Link>
                  <p className="mt-2">
                    {s.groups} {s.groups === 1 ? "group" : "groups"} · {s.status.toLowerCase()}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Factory collection and warehouse receipt</h2>
        {d.incoming.length === 0 ? (
          <EmptyState title="No accepted stock awaiting receipt" />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {d.incoming.map((o) => (
              <li key={o.id}>
                <Card className="h-full text-sm">
                  <Link
                    href={`/admin/offers/${o.id}`}
                    className="font-semibold text-accent underline"
                  >
                    {o.name}
                  </Link>
                  <p className="mt-1">{o.seller.company || o.seller.name}</p>
                  {o.seller.city && <p className="text-subtle">{o.seller.city}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone="info">{o.kind === "TEST" ? "Test pieces" : "Bulk"}</Badge>
                    <Badge>Awaiting receipt</Badge>
                  </div>
                  <p className="mt-2 text-xs text-subtle">Accepted {formatDateTime(o.decidedAt)}</p>
                  {o.seller.phone && (
                    <a
                      href={`tel:${o.seller.phone}`}
                      className="mt-2 inline-flex min-h-11 items-center text-accent underline"
                    >
                      Call factory: {o.seller.phone}
                    </a>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Received stock awaiting design linking</h2>
        {d.received.length === 0 ? (
          <EmptyState title="No received stock awaiting linking" />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {d.received.map((o) => (
              <li key={o.id}>
                <Card className="h-full text-sm">
                  <Link
                    href={`/admin/offers/${o.id}`}
                    className="font-semibold text-accent underline"
                  >
                    {o.name}
                  </Link>
                  <p className="mt-1">{o.seller.company || o.seller.name}</p>
                  <p className="mt-2 text-subtle">
                    Received by {o.receivedBy?.name ?? "packing staff"}{" "}
                    {formatDateTime(o.receivedAt)}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
