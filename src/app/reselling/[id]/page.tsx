import { notFound } from "next/navigation";
import { BackLink } from "@/components/client";
import { ActionForm } from "@/components/resale-forms";
import { Alert, Badge, Card, Input, PageHeader } from "@/components/ui";
import { D } from "@/lib/decimal";
import { formatDate, formatLKR } from "@/lib/format";
import { redirectCompany, requireUser } from "@/server/auth/session";
import { getListing } from "@/server/resale";
import { cancelReservationAction, reserveAction } from "@/server/resale-actions";

const STATUS = {
  RESERVED: "Reserved",
  COMPLETED: "Collected",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
} as const;

export default async function ListingPage({ params }: PageProps<"/reselling/[id]">) {
  const id = (await params).id;
  const user = await requireUser(`/reselling/${id}`);
  await redirectCompany();
  const l = await getListing(id, user);
  if (!l) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <BackLink fallback="/reselling" />
        <PageHeader
          title={`${l.name} ${l.size}`}
          description={`${l.companyName}${l.city ? ` · ${l.city}` : ""}`}
          actions={l.cancelled ? <Badge>Cancelled</Badge> : null}
        />
      </div>
      <Card className="flex flex-col gap-2">
        {l.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={l.photo} alt="" className="size-24 rounded-lg bg-muted object-cover" />
        ) : null}
        <p className="text-lg font-semibold">{formatLKR(l.unitPrice)} each</p>
        <p className="text-sm" data-testid="listing-available">
          {l.available} available
        </p>
        <p className="text-sm text-subtle">Sold by {l.sellerName}</p>
        {l.spot ? <p className="text-sm">Pickup: {l.spot}</p> : null}
      </Card>

      {l.mine.map((r) => (
        <Card key={r.id} className="flex flex-col gap-2" data-testid="my-reservation">
          <p className="text-sm font-semibold">
            You reserved {r.qty} · {STATUS[r.status as keyof typeof STATUS]}
          </p>
          {r.status === "RESERVED" ? (
            <>
              <Alert tone="info">
                Pay {formatLKR(new D(l.unitPrice.toString()).times(r.qty))} to the seller at pickup
                by {formatDate(r.expiresAt)}. A reservation is not a completed sale.
              </Alert>
              <ActionForm
                act={cancelReservationAction}
                fields={{ id: r.id, back: `/reselling/${id}` }}
                label="Cancel reservation"
                variant="secondary"
              />
            </>
          ) : null}
        </Card>
      ))}

      {!l.isSeller && !l.cancelled && l.available > 0 ? (
        <ActionForm act={reserveAction} fields={{ listingId: l.id }} label="Reserve">
          <label className="flex flex-col gap-1 text-sm">
            Quantity
            <Input
              id="reserve-qty"
              name="qty"
              type="number"
              min={1}
              max={l.available}
              defaultValue={1}
              required
              className="w-24"
            />
          </label>
        </ActionForm>
      ) : null}
    </div>
  );
}
