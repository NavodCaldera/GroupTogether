import Link from "next/link";
import { notFound } from "next/navigation";
import { BasketCard } from "@/components/basket-card";
import { StartBasketForm } from "@/components/basket-forms";
import { PackContents, PackPhoto } from "@/components/pack-contents";
import { BackLink } from "@/components/client";
import { LinkButton, PageHeader } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { sizeTable } from "@/lib/pack-money";
import { getCurrentUser } from "@/server/auth/session";
import { getPack, openBaskets } from "@/server/packs";

export default async function PackPage({ params }: PageProps<"/packs/[slug]">) {
  const slug = (await params).slug;
  const [pack, user] = await Promise.all([getPack(slug), getCurrentUser()]);
  if (!pack) notFound();
  const v = pack.version;
  const sizes = sizeTable(v);
  const path = `/packs/${slug}`;
  const baskets = user
    ? ((await openBaskets(user, pack.company.slug))?.filter((b) => b.packSlug === slug) ?? null)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <BackLink fallback={`/companies/${pack.company.slug}`} />
        <PageHeader
          title={pack.name}
          description={
            <Link className="underline" href={`/companies/${pack.company.slug}`}>
              {pack.company.name}
            </Link>
          }
        />
      </div>
      <PackPhoto src={pack.photo} className="rounded-2xl" />
      <PackContents
        items={v.items}
        price={v.pricePerFamily}
        sizes={sizes}
        householdSize={v.householdSize}
        durationDays={pack.durationDays}
      />

      <section aria-labelledby="pack-baskets" className="flex flex-col gap-3">
        <h2 id="pack-baskets" className="text-lg font-semibold">
          Open baskets near you
        </h2>
        {!user ? (
          <LinkButton href={`/sign-in?next=${encodeURIComponent(path)}`}>
            Sign in to join or start a basket
          </LinkButton>
        ) : baskets === null ? (
          <LinkButton href="/account/location">Set your address pin</LinkButton>
        ) : (
          <>
            {baskets.map((b) => (
              <BasketCard key={b.id} b={b} />
            ))}
            {baskets.some((b) => b.mine) ? null : (
              <StartBasketForm
                versionId={v.id}
                path={path}
                sizes={sizes.map((x) => ({ size: x.size, price: formatLKR(x.price) }))}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}
