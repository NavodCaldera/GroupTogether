import { BasketCard } from "@/components/basket-card";
import { Button, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { homeCategories, openBaskets } from "@/server/packs";

/** Every open basket within 1 km, contacts first; filter by company or category. */
export default async function BasketsPage({ searchParams }: PageProps<"/baskets">) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
  const company = one(q.company);
  const category = one(q.category);
  const user = await requireUser([...BUYER_ROLES], "/baskets");
  const [cats, baskets] = await Promise.all([
    homeCategories(),
    openBaskets(user, { companySlug: company, categorySlug: category }),
  ]);
  const select = "rounded-lg border border-line bg-paper px-3 py-2 text-sm";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Open baskets" />
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          Category
          <select name="category" defaultValue={category ?? ""} className={select}>
            <option value="">All</option>
            {cats.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Company
          <select name="company" defaultValue={company ?? ""} className={select}>
            <option value="">All</option>
            {cats.flatMap((c) =>
              c.companies.map((co) => (
                <option key={co.slug} value={co.slug}>
                  {co.name}
                </option>
              )),
            )}
          </select>
        </label>
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
