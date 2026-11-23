import Link from "next/link";
import { notFound } from "next/navigation";
import { BasketCard } from "@/components/basket-card";
import { BackLink } from "@/components/client";
import { PackPhoto, SizeTable } from "@/components/pack-contents";
import { Badge, CompanyLogo, EmptyState, LinkButton } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { getCompany, openBaskets } from "@/server/packs";

export default async function CompanyPage({ params }: PageProps<"/companies/[slug]">) {
  const slug = (await params).slug;
  const [company, user] = await Promise.all([getCompany(slug), getCurrentUser()]);
  if (!company) notFound();
  const baskets = user ? await openBaskets(user, slug) : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <BackLink fallback="/" />
        <div className="overflow-hidden rounded-2xl border border-line bg-paper">
          {company.banner ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.banner} alt="" className="aspect-[4/1] w-full object-cover" />
          ) : (
            <div className="aspect-[4/1] w-full bg-gradient-to-br from-accent/40 to-accent/10" />
          )}
          <div className="px-4 pb-4 sm:px-6 sm:pb-6">
            <CompanyLogo
              name={company.name}
              logo={company.logo}
              round
              className="-mt-12 sm:-mt-16"
            />
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">{company.name}</h1>
            <p className="mt-2 text-sm font-semibold" data-testid="packs-bought">
              {company.boughtToday.toLocaleString("en-LK")} family{" "}
              {company.boughtToday === 1 ? "pack" : "packs"} bought today
            </p>
          </div>
        </div>
      </div>

      <section aria-labelledby="packs">
        <h2 id="packs" className="mb-3 text-lg font-semibold">
          Standard packs
        </h2>
        {company.packs.length === 0 ? (
          <EmptyState title="No packs yet" />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {company.packs.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/packs/${p.slug}`}
                  className="flex h-full flex-col gap-2 overflow-hidden rounded-xl border border-line bg-paper pb-4 transition hover:border-accent"
                >
                  <PackPhoto src={p.photo} />
                  <div className="flex flex-col gap-2 px-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{p.name}</span>
                      <span className="flex gap-1">
                        <Badge>{p.durationDays} days</Badge>
                        {p.householdSize ? (
                          <Badge>Family of {p.householdSize} members</Badge>
                        ) : null}
                      </span>
                    </div>
                    <span className="text-lg font-semibold">{formatLKR(p.price)}</span>
                    <SizeTable sizes={p.sizes} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="open-baskets">
        <h2 id="open-baskets" className="mb-3 text-lg font-semibold">
          Open baskets near you
        </h2>
        {!user ? (
          <LinkButton href={`/sign-in?next=${encodeURIComponent(`/companies/${slug}`)}`}>
            Sign in to see baskets near you
          </LinkButton>
        ) : baskets === null ? (
          <LinkButton href="/account/location">Set your address pin</LinkButton>
        ) : baskets.length === 0 ? (
          <EmptyState title="No open baskets within 1 km" />
        ) : (
          <ul className="flex flex-col gap-3">
            {baskets.map((b) => (
              <li key={b.id}>
                <BasketCard b={b} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
