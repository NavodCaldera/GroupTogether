import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { formatDistance } from "@/lib/distance";
import { formatLKR } from "@/lib/format";
import { redirectCompany, requireUser } from "@/server/auth/session";
import { browseListings } from "@/server/resale";

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
      {list.length === 0 ? (
        <EmptyState title="Nothing for resale here" />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((l) => (
            <li key={l.id}>
              <Link
                href={`/reselling/${l.id}`}
                data-testid="listing"
                className="flex items-center gap-3 rounded-xl border border-line bg-paper p-4 transition hover:border-accent"
              >
                {l.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.photo}
                    alt=""
                    className="size-14 shrink-0 rounded-lg bg-muted object-cover"
                  />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {l.name} <span className="font-normal text-subtle">{l.size}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-subtle">
                    {l.companyName}
                    {l.distanceKm != null ? <span>· {formatDistance(l.distanceKm)}</span> : null}
                    {l.city ? <span>· {l.city}</span> : null}
                    {l.contact ? <Badge tone="info">Contact</Badge> : null}
                  </span>
                  <span className="block text-sm">
                    {l.available} available · {formatLKR(l.unitPrice)} each
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
