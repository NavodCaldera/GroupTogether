import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/client";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatLKR } from "@/lib/format";
import { redirectCompany, requireUser } from "@/server/auth/session";
import { purchases } from "@/server/resale";

export const metadata: Metadata = { title: "Purchase history" };

const STATUS = {
  PENDING: "Waiting for payment",
  OPEN: "Filling",
  FULL: "Ordered",
  CLOSED: "Refunded",
} as const;

export default async function PurchasesPage() {
  const user = await requireUser("/purchases");
  await redirectCompany();
  const list = await purchases(user.id);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <BackLink fallback="/reselling" />
        <PageHeader title="Purchase history" />
      </div>
      {list.length === 0 ? <EmptyState title="No purchases yet" /> : null}
      <ul className="flex flex-col gap-3">
        {list.map((p) => (
          <li key={p.groupId}>
            <Link
              href={`/purchases/${p.groupId}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-paper p-4 transition hover:border-accent"
            >
              <span className="min-w-0">
                <span className="block font-semibold">
                  {p.companyName} · {p.packName}
                </span>
                <span className="text-sm text-subtle">
                  {formatLKR(p.price)} · {formatDate(p.paidAt)}
                </span>
              </span>
              <Badge tone={p.status === "FULL" ? "good" : "neutral"}>{STATUS[p.status]}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
