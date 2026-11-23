import { BasketCard } from "@/components/basket-card";
import { BasketFilter } from "@/components/client";
import { Button, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { redirectCompany, requireUser } from "@/server/auth/session";
import { homeCategories, openBaskets } from "@/server/packs";

/** Every open basket within 1 km, contacts first; filter by company or category. */
export default async function BasketsPage({ searchParams }: PageProps<"/baskets">) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
  const company = one(q.company);
  const category = one(q.category);
  const user = await requireUser("/baskets");
  await redirectCompany();
  const [cats, baskets] = await Promise.all([
    homeCategories(),
    openBaskets(user, { companySlug: company, categorySlug: category }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Open baskets" />
      <form method="get" className="flex flex-wrap items-end gap-2">
        <BasketFilter
          cats={cats.map((c) => ({
            slug: c.slug,
            name: c.name,
            companies: c.companies.map((co) => ({ slug: co.slug, name: co.name })),
          }))}
          category={category ?? ""}
          company={company ?? ""}
        />
        <Button type="submit">Filter</Button>
      </form>
      {baskets === null ? (
        <LinkButton href="/account/location">Set your address pin</LinkButton>
      ) : baskets.length === 0 ? (
        <EmptyState title="No open baskets near you" />
      ) : (
        <div className="flex flex-col gap-3">
          {baskets.map((b) => (
            <BasketCard key={b.id} b={b} />
          ))}
        </div>
      )}
    </div>
  );
}
