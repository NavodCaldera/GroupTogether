import { BasketCard } from "@/components/basket-card";
import { Button, EmptyState, LinkButton, PageHeader, Select } from "@/components/ui";
import { redirectCompany, requireUser } from "@/server/auth/session";
import { homeCompanies, openBaskets } from "@/server/packs";

/** Every open basket within 1 km, contacts first; filter by company. */
export default async function BasketsPage({ searchParams }: PageProps<"/baskets">) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
  const company = one(q.company);
  const user = await requireUser("/baskets");
  await redirectCompany();
  const [companies, baskets] = await Promise.all([homeCompanies(), openBaskets(user, company)]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Open baskets" />
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          Company
          <Select name="company" defaultValue={company ?? ""}>
            <option value="">All</option>
            {companies.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
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
            <BasketCard key={b.id} b={b} showCompany />
          ))}
        </div>
      )}
    </div>
  );
}
