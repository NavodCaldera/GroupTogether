import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/client";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { requirePacker } from "@/server/auth/session";
import { receivedAction } from "@/server/packing-actions";
import { stockForPacker } from "@/server/receiving";
import { PackingForm } from "../../packing-form";

export const metadata: Metadata = { title: "Stock to receive" };

/**
 * A seller's stock coming to our store (an accepted offer): what it is, who sends it, and one
 * "Received" button for when it arrives (product owner, 2026-10-20). No amounts.
 */
export default async function ReceiveStockPage({ params }: PageProps<"/packing/stock/[id]">) {
  await requirePacker();
  const { id } = await params;
  const o = await stockForPacker(id);
  if (!o) notFound();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <div>
        <BackLink fallback="/packing" />
        <PageHeader
          title={o.name}
          actions={
            <Badge tone={o.receivedAt ? "good" : "info"}>
              {o.receivedAt ? "Received" : "To receive"}
            </Badge>
          }
        />
      </div>

      <Card className="flex flex-col gap-3 text-sm">
        <p className="whitespace-pre-line">{o.description}</p>
        {o.note && <p className="text-subtle">Note: {o.note}</p>}
      </Card>

      <Card className="text-sm">
        <p className="font-medium">From {o.seller.company || o.seller.name}</p>
        {o.seller.company && <p className="text-subtle">{o.seller.name}</p>}
        {o.seller.phone && (
          <a href={`tel:${o.seller.phone}`} className="text-accent underline">
            {o.seller.phone}
          </a>
        )}
        {o.seller.address && (
          <p className="mt-1 text-subtle">
            {o.seller.address}
            {o.seller.city && `, ${o.seller.city}`}
          </p>
        )}
      </Card>

      {o.receivedAt ? (
        <Alert tone="good">
          Received by {o.receivedBy?.name} · {formatDateTime(o.receivedAt)}
        </Alert>
      ) : (
        <PackingForm action={receivedAction} cartId={o.id} code={o.name} submit="Received" />
      )}
    </div>
  );
}
