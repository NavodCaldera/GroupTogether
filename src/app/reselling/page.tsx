import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, LinkButton, PageHeader, cx } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { redirectCompany, requireUser } from "@/server/auth/session";
import { browseListings } from "@/server/resale";

export const metadata: Metadata = { title: "Reselling" };

const VIEWS = [
  ["contacts", "From Contacts"],
  ["nearby", "Nearby"],
] as const;

/** Unopened items other buyers resell at what they paid: from mutual contacts, or within 1 km. */
export default async function ResellingPage({ searchParams }: PageProps<"/reselling">) {
  const user = await requireUser("/reselling");
  await redirectCompany();
  const view = (await searchParams).view === "nearby" ? "nearby" : "contacts";
  const list = await browseListings(user, view);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <PageHeader
        title="Reselling"
        actions={
          <>
            <LinkButton variant="secondary" href="/purchases">
              Purchase history
            </LinkButton>
            <LinkButton variant="secondary" href="/reselling/mine">
              My listings
            </LinkButton>
          </>
        }
      />
      <nav className="flex gap-2" aria-label="Reselling views">
        {VIEWS.map(([v, label]) => (
          <Link
            key={v}
            href={`/reselling?view=${v}`}
            aria-current={v === view ? "page" : undefined}
            className={cx(
              "rounded-full border px-4 py-2 text-sm font-medium",
              v === view ? "border-accent bg-accent text-on-accent" : "border-line hover:bg-muted",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      {list === null ? (
        <LinkButton href="/account/location">Set your address pin</LinkButton>
      ) : list.length === 0 ? (
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
                  <span className="block text-sm text-subtle">
                    {l.companyName}
                    {l.city ? ` · ${l.city}` : ""}
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
