import type { Metadata } from "next";
import { BackLink } from "@/components/client";
import { ActionForm } from "@/components/resale-forms";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatLKR } from "@/lib/format";
import { redirectCompany, requireUser } from "@/server/auth/session";
import { myResale } from "@/server/resale";
import {
  cancelListingAction,
  cancelReservationAction,
  completeAction,
} from "@/server/resale-actions";

export const metadata: Metadata = { title: "My listings" };

const STATUS = {
  RESERVED: "Reserved",
  COMPLETED: "Collected",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
} as const;
const label = (s: string) => STATUS[s as keyof typeof STATUS];

export default async function MyListingsPage() {
  const user = await requireUser("/reselling/mine");
  await redirectCompany();
  const { listings, reservations } = await myResale(user.id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <BackLink fallback="/reselling" />
        <PageHeader title="My listings" />
      </div>
      {listings.length === 0 ? <EmptyState title="No listings yet" /> : null}
      <ul className="flex flex-col gap-3">
        {listings.map((l) => (
          <li key={l.id}>
            <Card className="flex flex-col gap-3" data-testid="my-listing">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {l.name} <span className="font-normal text-subtle">{l.size}</span>
                  </p>
                  <p className="text-sm text-subtle">
                    {l.companyName} · {formatLKR(l.unitPrice)} each · {l.spot}
                  </p>
                  <p className="text-sm">
                    {l.available} available · {l.reserved} reserved · {l.completed} collected
                  </p>
                </div>
                {l.cancelled ? <Badge>Cancelled</Badge> : null}
              </div>
              {l.reservations.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-sm"
                >
                  <span>
                    {r.buyerName} · {r.qty} · {label(r.status)}
                    {r.status === "RESERVED" ? ` until ${formatDate(r.expiresAt)}` : ""}
                  </span>
                  {r.status === "RESERVED" ? (
                    <span className="flex gap-2">
                      <ActionForm act={completeAction} fields={{ id: r.id }} label="Collected" />
                      <ActionForm
                        act={cancelReservationAction}
                        fields={{ id: r.id }}
                        label="Cancel"
                        variant="secondary"
                      />
                    </span>
                  ) : null}
                </div>
              ))}
              {!l.cancelled ? (
                <ActionForm
                  act={cancelListingAction}
                  fields={{ id: l.id }}
                  label="Cancel listing"
                  variant="ghost"
                />
              ) : null}
            </Card>
          </li>
        ))}
      </ul>

      {reservations.length > 0 ? (
        <section aria-labelledby="my-reservations" className="flex flex-col gap-3">
          <h2 id="my-reservations" className="text-lg font-semibold">
            My reservations
          </h2>
          <ul className="flex flex-col gap-3">
            {reservations.map((r) => (
              <li key={r.id}>
                <Card className="flex flex-col gap-2 text-sm">
                  <span className="block font-semibold">
                    {r.name} {r.size} · {r.qty}
                  </span>
                  <span className="block text-subtle">
                    {r.companyName} · {formatLKR(r.unitPrice)} each · {r.sellerName}
                  </span>
                  <span className="block">
                    {label(r.status)}
                    {r.status === "RESERVED" ? ` until ${formatDate(r.expiresAt)}` : ""}
                    {r.spot ? ` · ${r.spot}` : ""}
                  </span>
                  {r.status === "RESERVED" ? (
                    <ActionForm
                      act={cancelReservationAction}
                      fields={{ id: r.id }}
                      label="Cancel reservation"
                      variant="secondary"
                    />
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
