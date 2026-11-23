import Link from "next/link";
import { notFound } from "next/navigation";
import { JoinBasketForm } from "@/components/basket-forms";
import { PackContents } from "@/components/pack-contents";
import { Alert, Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { formatDistance } from "@/lib/distance";
import { formatDate, formatLKR } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { getBasket } from "@/server/packs";

const STATUS = { PENDING: "Waiting for payment", OPEN: "Open", FULL: "Full · order placed", CLOSED: "Closed" } as const;

export default async function BasketPage({ params }: PageProps<"/baskets/[id]">) {
  const id = (await params).id;
  const user = await getCurrentUser();
  const b = await getBasket(id, user);
  if (!b) notFound();
  const pct = Math.round((b.joined / b.size) * 100);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title={b.pack.name}
        description={
          <Link className="underline" href={`/companies/${b.pack.company.slug}`}>
            {b.pack.company.name}
          </Link>
        }
        actions={<Badge tone={b.status === "FULL" ? "good" : "info"}>{STATUS[b.status]}</Badge>}
      />

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <span>
            {b.distanceKm !== null ? formatDistance(b.distanceKm) : null}
            {b.city ? ` · ${b.city}` : ""}
          </span>
          <span className="text-subtle">Closes {formatDate(b.closesAt)}</span>
        </div>
        <div
          className="h-3 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={b.size}
          aria-valuenow={b.joined}
          aria-label={`${b.joined} of ${b.size} families`}
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-lg font-semibold" data-testid="basket-progress">
          {b.joined} of {b.size} families
        </p>
        {b.isOwner ? <Badge tone="good">You are the basket owner</Badge> : null}
        {b.myStatus === "PAID" && !b.isOwner ? <Badge tone="good">You are in</Badge> : null}
        {b.myStatus === "HELD" ? <Alert tone="info">Your payment is being confirmed</Alert> : null}
      </Card>

      <PackContents
        items={b.items}
        price={b.price}
        families={b.size}
        householdSize={b.householdSize}
        durationDays={b.pack.durationDays}
      />

      {b.joinable ? (
        <JoinBasketForm groupId={b.id} price={formatLKR(b.price)} />
      ) : !user ? (
        <LinkButton href={`/sign-in?next=${encodeURIComponent(`/baskets/${id}`)}`}>Sign in to join</LinkButton>
      ) : null}
    </div>
  );
}
