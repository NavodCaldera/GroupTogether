import Link from "next/link";
import { notFound } from "next/navigation";
import { BasketCard } from "@/components/basket-card";
import { Badge, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { getCompany, openBaskets } from "@/server/packs";

export default async function CompanyPage({ params }: PageProps<"/companies/[slug]">) {
  const slug = (await params).slug;
  const [company, user] = await Promise.all([getCompany(slug), getCurrentUser()]);
  if (!company) notFound();
  const baskets = user ? await openBaskets(user, { companySlug: slug }) : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={company.name}
        description={company.category.name}
        actions={company.demo ? <Badge>Demo</Badge> : null}
      />

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
                  className="flex h-full flex-col gap-2 rounded-xl border border-line bg-paper p-4 transition hover:border-accent"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{p.name}</span>
                    <Badge>{p.durationDays} days</Badge>
                  </div>
                  <span className="text-sm">{p.families} family packs per basket</span>
                  <span className="text-sm text-subtle">{p.items} items in each family pack</span>
                  <span className="mt-auto text-lg font-semibold">{formatLKR(p.price)} per family</span>
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
