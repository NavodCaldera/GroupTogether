import type { Metadata } from "next";
import { ActionForm } from "@/components/resale-forms";
import { Badge, EmptyState, Input, LinkButton, PageHeader } from "@/components/ui";
import { D } from "@/lib/decimal";
import { formatDistance } from "@/lib/distance";
import { formatDate, formatLKR } from "@/lib/format";
import { redirectCompany, requireUser } from "@/server/auth/session";
import { browseListings } from "@/server/resale";
import { cancelReservationAction, reserveAction } from "@/server/resale-actions";

export const metadata: Metadata = { title: "Reselling" };

type Listing = Awaited<ReturnType<typeof browseListings>>[number];

/** Listings grouped by seller, in the list's order: contacts first, then nearest. */
function bySeller(list: Listing[]) {
  const sellers = new Map<string, { first: Listing; items: Listing[] }>();
  for (const l of list) {
    const s = sellers.get(l.sellerId);
    if (s) s.items.push(l);
    else sellers.set(l.sellerId, { first: l, items: [l] });
  }
  return [...sellers.values()];
}

/** Unopened items other buyers resell at what they paid, one card per seller. */
export default async function ResellingPage() {
  const user = await requireUser("/reselling");
  await redirectCompany();
  const sellers = bySeller(await browseListings(user));

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
      {sellers.length === 0 ? <EmptyState title="Nothing for resale here" /> : null}
      <ul className="flex flex-col gap-3">
        {sellers.map(({ first: s, items }) => (
          <li key={s.sellerId}>
            <div className="rounded-xl border border-line bg-paper" data-testid="seller">
              <details className="group" open={items.some((l) => l.mine.length > 0)}>
                <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                  <span
                    aria-hidden
                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-lg font-semibold"
                  >
                    {s.sellerName.charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{s.sellerName}</span>
                      {items.some((l) => l.contact) ? <Badge tone="info">Contact</Badge> : null}
                    </span>
                    <span className="block text-sm text-subtle">
                      {[s.distanceKm != null ? formatDistance(s.distanceKm) : null, s.city]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="text-sm font-medium">
                    {items.length} {items.length === 1 ? "item" : "items"}
                  </span>
                  <svg
                    aria-hidden
                    viewBox="0 0 20 20"
                    className="size-5 shrink-0 text-subtle transition group-open:rotate-180"
                  >
                    <path
                      d="M5 8l5 5 5-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </summary>

                <ul className="flex flex-col border-t border-line">
                  {items.map((l) => (
                    <li
                      key={l.id}
                      data-testid="listing"
                      className="flex flex-col gap-3 border-b border-line p-4 last:border-b-0"
                    >
                      <div className="flex gap-3">
                        {l.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={l.photo}
                            alt=""
                            className="size-14 shrink-0 rounded-lg bg-muted object-cover"
                          />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">
                            {l.name} <span className="font-normal text-subtle">{l.size}</span>
                          </p>
                          <p className="text-sm text-subtle">{l.companyName}</p>
                          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                            <span className="font-semibold">{formatLKR(l.unitPrice)}</span>
                            {l.retailPrice ? (
                              <s className="text-subtle">{formatLKR(l.retailPrice)}</s>
                            ) : null}
                            {l.discountPct ? <Badge tone="good">{l.discountPct}% off</Badge> : null}
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
                            Pay {formatLKR(new D(l.unitPrice.toString()).times(r.qty))} to{" "}
                            {l.sellerName} at pickup by {formatDate(r.expiresAt)}. A reservation is
                            not a completed sale.
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
                          fields={
                            l.available === 1 ? { listingId: l.id, qty: "1" } : { listingId: l.id }
                          }
                          label="Reserve"
                          className="flex flex-wrap items-center gap-3"
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
                          <span className="text-sm text-subtle">{l.available} available</span>
                        </ActionForm>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
