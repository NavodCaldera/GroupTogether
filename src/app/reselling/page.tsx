import type { Metadata } from "next";
import { ActionForm } from "@/components/resale-forms";
import { Badge, Card, EmptyState, Input, LinkButton, PageHeader } from "@/components/ui";
import { D } from "@/lib/decimal";
import { formatDistance } from "@/lib/distance";
import { formatDate, formatLKR } from "@/lib/format";
import { redirectCompany, requireUser } from "@/server/auth/session";
import { browseListings } from "@/server/resale";
import { cancelReservationAction, reserveAction } from "@/server/resale-actions";

export const metadata: Metadata = { title: "Reselling" };

/** Unopened items other buyers resell at what they paid: contacts' first, then within 1 km. */
export default async function ResellingPage() {
  const user = await requireUser("/reselling");
  await redirectCompany();
  const list = await browseListings(user);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <PageHeader
        title="Reselling"
        actions={
          <LinkButton variant="secondary" href="/reselling/mine">
            My listings
          </LinkButton>
        }
      />
      {list.length === 0 ? <EmptyState title="Nothing for resale here" /> : null}
      <ul className="flex flex-col gap-3">
        {list.map((l) => (
          <li key={l.id}>
            <Card className="flex flex-col gap-3" data-testid="listing">
              <div className="flex gap-3">
                {l.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.photo}
                    alt=""
                    className="size-16 shrink-0 rounded-lg bg-muted object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="font-semibold">
                      {l.name} <span className="font-normal text-subtle">{l.size}</span>
                    </p>
                    <p className="font-semibold">
                      {formatLKR(l.unitPrice)} <span className="font-normal text-subtle">each</span>
                    </p>
                  </div>
                  <p className="text-sm text-subtle">{l.companyName}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
                    <span className="font-medium">{l.sellerName}</span>
                    {l.contact ? <Badge tone="info">Contact</Badge> : null}
                    {l.distanceKm != null ? (
                      <span className="text-subtle">· {formatDistance(l.distanceKm)}</span>
                    ) : null}
                    {l.city ? <span className="text-subtle">· {l.city}</span> : null}
                  </p>
                </div>
              </div>

              {l.mine.map((r) => (
                <div
                  key={r.id}
                  data-testid="my-reservation"
                  className="flex flex-col gap-2 rounded-lg bg-muted p-3 text-sm"
                >
                  <p className="font-semibold">You reserved {r.qty}</p>
                  {l.spot ? <p>Pickup: {l.spot}</p> : null}
                  <p>
                    Pay {formatLKR(new D(l.unitPrice.toString()).times(r.qty))} to {l.sellerName}{" "}
                    at pickup by {formatDate(r.expiresAt)}. A reservation is not a completed sale.
                  </p>
                  <ActionForm
                    act={cancelReservationAction}
                    fields={{ id: r.id, back: "/reselling" }}
                    label="Cancel reservation"
                    variant="secondary"
                  />
                </div>
              ))}

              {l.available > 0 ? (
                <ActionForm
                  act={reserveAction}
                  fields={l.available === 1 ? { listingId: l.id, qty: "1" } : { listingId: l.id }}
                  label="Reserve"
                  className="flex flex-wrap items-center gap-3 border-t border-line pt-3"
                >
                  {l.available > 1 ? (
                    <label className="flex items-center gap-2 text-sm">
                      Quantity
                      <Input
                        id={`qty-${l.id}`}
                        name="qty"
                        type="number"
                        min={1}
                        max={l.available}
                        defaultValue={1}
                        required
                        className="w-20"
                      />
                    </label>
                  ) : null}
                  <span className="text-sm text-subtle" data-testid="listing-available">
                    {l.available} available
                  </span>
                </ActionForm>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
