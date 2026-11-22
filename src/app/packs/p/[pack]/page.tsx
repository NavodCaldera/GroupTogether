import { notFound } from "next/navigation";
import { JoinForm, PickupForm, StartForm } from "@/components/pack-forms";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { formatDate, formatLKR } from "@/lib/format";
import { isBuyerRole } from "@/lib/roles";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getPack, nearbyGroups, pickupPoints } from "@/server/packs";

export default async function PackPage({ params }: PageProps<"/packs/p/[pack]">) {
  const slug = (await params).pack;
  const pack = await getPack(slug);
  if (!pack) notFound();
  const v = pack.version;
  const path = `/packs/p/${slug}`;
  const user = await getCurrentUser();
  const buyer = user && isBuyerRole(user.role) ? user : null;
  const pickupId = buyer
    ? ((await db.user.findUnique({ where: { id: buyer.id }, select: { pickupAgentId: true } }))?.pickupAgentId ??
      null)
    : null;
  const [points, groups, mine] = await Promise.all([
    buyer ? pickupPoints() : [],
    pickupId ? nearbyGroups(v.id, pickupId) : [],
    buyer
      ? db.packMember.findMany({
          where: { userId: buyer.id, group: { versionId: v.id } },
          select: { groupId: true },
        })
      : [],
  ]);
  const joined = new Set(mine.map((m) => m.groupId));
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <PageHeader
        title={pack.name}
        description={`${pack.company.name} · ${pack.durationDays} days`}
        actions={pack.company.demo ? <Badge>Demo</Badge> : null}
      />
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Your family gets</h2>
          <span className="font-semibold">{formatLKR(v.pricePerFamily)} per family</span>
        </div>
        <ul className="divide-y divide-line">
          {v.items.map((i) => (
            <li key={`${i.name}-${i.size}`} className="flex justify-between gap-2 py-2 text-sm">
              <span>
                {i.name} <span className="text-subtle">{i.size}</span>
              </span>
              <span>× {i.qty}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge tone="info">Group of {v.groupSize} families</Badge>
          {v.householdSize ? <Badge>For {v.householdSize} people</Badge> : null}
        </div>
      </Card>

      <section className="flex flex-col gap-3" aria-label="Groups near you">
        <h2 className="font-semibold">Groups near you</h2>
        {!buyer ? (
          <LinkButton href={`/sign-in?next=${encodeURIComponent(path)}`}>Sign in to join</LinkButton>
        ) : (
          <>
            <PickupForm
              path={path}
              current={pickupId}
              points={points.map((p) => ({ id: p.id, label: [p.city, p.address].filter(Boolean).join(" · ") }))}
            />
            {groups.map((g) => (
              <Card key={g.id} className="flex flex-col gap-2" data-testid="pack-group">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{g.pickup}</span>
                  <span>
                    {g.joined} of {g.size} families
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge>{g.spotsLeft} spots left</Badge>
                  {g.closesAt ? <Badge>Closes {formatDate(g.closesAt)}</Badge> : null}
                </div>
                {joined.has(g.id) ? (
                  <Badge tone="good">You are in</Badge>
                ) : (
                  <JoinForm path={path} groupId={g.id} />
                )}
              </Card>
            ))}
            {pickupId && groups.length === 0 ? <StartForm path={path} versionId={v.id} /> : null}
          </>
        )}
      </section>
    </main>
  );
}
