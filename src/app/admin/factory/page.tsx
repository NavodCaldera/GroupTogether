import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { factoryDashboard } from "@/server/factory-admin";
import { requireAdmin } from "@/server/auth/session";
import { pendingMissingReports } from "@/server/orders/delivery";

export const metadata: Metadata = { title: "Apparel and factories" };

export default async function FactoryAdminPage() {
  const admin = await requireAdmin("FACTORY");
  const [d, missing] = await Promise.all([factoryDashboard(), pendingMissingReports(admin.id)]);
  return (
    <>
      <PageHeader title="Apparel and factories" />
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
        <dl>
          <dt className="text-sm text-subtle">Active factories</dt>
          <dd className="text-xl font-semibold">{d.factories}</dd>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <LinkButton href="/admin/products" variant="secondary">
            Products
          </LinkButton>
        </div>
      </Card>
    </>
  );
}
