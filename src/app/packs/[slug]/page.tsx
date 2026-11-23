import Link from "next/link";
import { notFound } from "next/navigation";
import { BasketCard } from "@/components/basket-card";
import { StartBasketForm } from "@/components/basket-forms";
import { PackContents } from "@/components/pack-contents";
import { Badge, LinkButton, PageHeader } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { isBuyerRole } from "@/lib/roles";
import { getCurrentUser } from "@/server/auth/session";
import { getPack, openBaskets } from "@/server/packs";

export default async function PackPage({ params }: PageProps<"/packs/[slug]">) {
  const slug = (await params).slug;
  const [pack, user] = await Promise.all([getPack(slug), getCurrentUser()]);
  if (!pack) notFound();
  const v = pack.version;
  const path = `/packs/${slug}`;
  const buyer = user && isBuyerRole(user.role) ? user : null;
  const baskets = buyer
    ? (await openBaskets(buyer, { companySlug: pack.company.slug }))?.filter((b) => b.packSlug === slug) ?? null
    : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title={pack.name}
        description={
          <Link className="underline" href={`/companies/${pack.company.slug}`}>
            {pack.company.name}
          </Link>
        }
        actions={pack.company.demo ? <Badge>Demo</Badge> : null}
      />
      <PackContents
        items={v.items}
        price={v.pricePerFamily}
        families={v.groupSize}
        householdSize={v.householdSize}
        durationDays={pack.durationDays}
      />

      <section aria-labelledby="pack-baskets" className="flex flex-col gap-3">
        <h2 id="pack-baskets" className="text-lg font-semibold">
          Open baskets near you
        </h2>
        {!buyer ? (
          <LinkButton href={`/sign-in?next=${encodeURIComponent(path)}`}>Sign in to join or start a basket</LinkButton>
        ) : baskets === null ? (
          <LinkButton href="/account/location">Set your address pin</LinkButton>
        ) : (
          <>
            {baskets.map((b) => (
              <BasketCard key={b.id} b={b} />
            ))}
            {baskets.some((b) => b.mine) ? null : (
              <StartBasketForm versionId={v.id} path={path} price={formatLKR(v.pricePerFamily)} />
            )}
          </>
        )}
      </section>
    </div>
  );
}
