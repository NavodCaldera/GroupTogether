import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/client";
import { Toast } from "@/components/toast";
import { Badge, Card, LinkButton, PageHeader, Select } from "@/components/ui";
import { discountPct, siteName } from "@/lib/brand-rules";
import { formatDateTime, formatLKR } from "@/lib/format";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { linkOfferAction } from "@/server/design-actions";
import { linkChoices } from "@/server/designs";
import { AdminForm } from "../../admin-form";
import { OfferDecision } from "../offer-decision";
import { OFFER_STATUS } from "../offer-status";

export const metadata: Metadata = { title: "Stock offer" };

/** One stock offer: what the seller sent, who they are, and Accept / Decline (confirmed) with a note. */
export default async function OfferPage({ params, searchParams }: PageProps<"/admin/offers/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const done = typeof sp.done === "string" ? sp.done : undefined;
  const o = await db.stockOffer.findUnique({
    where: { id },
    include: {
      receivedBy: { select: { name: true } },
      product: { select: { id: true, title: true } },
      seller: {
        select: {
          id: true,
          name: true,
          company: true,
          phone: true,
          email: true,
          address: true,
          city: true,
          lat: true,
          lng: true,
        },
      },
    },
  });
  if (!o) notFound();
  const open = o.status === "IN_REVIEW";
  const choices = o.status === "ACCEPTED" && !o.productId ? await linkChoices(o.seller.id) : [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      {done === "noted" && <Toast>Note sent to the seller.</Toast>}
      <div>
        <BackLink fallback="/admin/offers" />
        <PageHeader
          title={o.name}
          description={`Sent ${formatDateTime(o.createdAt)}`}
          actions={
            <div className="flex flex-wrap gap-2">
              {o.kind === "TEST" && <Badge tone="info">Test pieces</Badge>}
              {o.productUrl && <Badge tone="info">Luxury brand</Badge>}
              <Badge tone={OFFER_STATUS[o.status].tone}>{OFFER_STATUS[o.status].label}</Badge>
            </div>
          }
        />
      </div>

      <Card className="flex flex-col gap-3">
        <div>
          <p className="text-xs text-subtle">Total price asked</p>
          <p className="text-2xl font-semibold tabular-nums">{formatLKR(o.amount)}</p>
        </div>
        {o.actualPrice && o.offerPrice && (
          <dl className="grid grid-cols-3 gap-2 text-sm tabular-nums">
            <div>
              <dt className="text-xs text-subtle">Actual price</dt>
              <dd>{formatLKR(o.actualPrice)}</dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Discount price</dt>
              <dd>
                {formatLKR(o.offerPrice)}
                {discountPct(o.actualPrice, o.offerPrice) !== null &&
                  ` · ${discountPct(o.actualPrice, o.offerPrice)}% off`}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Pieces</dt>
              <dd>{o.pieces}</dd>
            </div>
          </dl>
        )}
        {o.productUrl && (
          <a
            href={o.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent underline"
          >
            {siteName(o.productUrl)} ↗
          </a>
        )}
        <div>
          <p className="text-xs text-subtle">Details</p>
          <p className="text-sm whitespace-pre-line">{o.description}</p>
        </div>
      </Card>

      <Card className="text-sm">
        <p className="font-medium">{o.seller.company || o.seller.name}</p>
        <p className="text-subtle">{o.seller.name}</p>
        {o.seller.phone && (
          <div className="flex flex-wrap items-center gap-3">
            <a href={`tel:${o.seller.phone}`} className="text-accent underline">
              {o.seller.phone}
            </a>
            <a
              href={`https://wa.me/${o.seller.phone.replace(/^0/, "94").replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-subtle hover:text-ink underline"
            >
              Chat on WhatsApp ↗
            </a>
          </div>
        )}
        <p className="text-subtle">{o.seller.email}</p>
        {o.seller.address ? (
          <p className="mt-2">
            {o.seller.address}
            {o.seller.city && `, ${o.seller.city}`}
          </p>
        ) : (
          <p className="mt-2 text-subtle">No factory address yet</p>
        )}
        {o.seller.lat != null && o.seller.lng != null && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${o.seller.lat},${o.seller.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline"
          >
            Open the pin in Google Maps
          </a>
        )}
      </Card>

      {open ? (
        <Card>
          <OfferDecision offerId={o.id} name={o.name} />
        </Card>
      ) : (
        <Card className="text-sm">
          <p>
            {o.status === "ACCEPTED" ? "Accepted" : "Declined"} {formatDateTime(o.decidedAt)}
          </p>
          {o.note && <p className="mt-1 text-subtle">Note: {o.note}</p>}
          {o.status === "ACCEPTED" && (
            <p className="mt-2">
              {o.receivedAt
                ? `Stock received by ${o.receivedBy?.name ?? "packing staff"} · ${formatDateTime(o.receivedAt)}`
                : "Waiting for the stock to reach our store (packing staff press Received)."}
            </p>
          )}
        </Card>
      )}

      {o.product ? (
        <Card className="text-sm">
          <p className="text-xs text-subtle">In the shop as</p>
          <a href={`/admin/products/${o.product.id}`} className="font-medium text-accent underline">
            {o.product.title}
          </a>
        </Card>
      ) : (
        o.status === "ACCEPTED" && (
          <Card className="flex flex-col gap-3">
            <AdminForm action={linkOfferAction} submit="Link" variant="secondary">
              <input type="hidden" name="offerId" value={o.id} />
              <Select name="productId" required defaultValue="" aria-label="Shop product">
                <option value="" disabled>
                  Shop product
                </option>
                {choices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} · {p.brand}
                  </option>
                ))}
              </Select>
            </AdminForm>
            <LinkButton href={`/admin/products/new?offer=${o.id}`}>Add product</LinkButton>
          </Card>
        )
      )}
    </div>
  );
}
