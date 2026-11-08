import Link from "next/link";
import { RewardForm } from "@/components/reward-form";
import { Badge, Card, EmptyState, Field, Input } from "@/components/ui";
import { BrandSearch, searchValue } from "@/components/brand-inbox";
import { subjectHref } from "@/server/brand-communications";
import { BrandSettlements } from "@/components/brand-settlements";
import { formatDate, formatLKR } from "@/lib/format";
import { GIFT_STATUS, giftReference, nextSettlementSunday } from "@/lib/gift-rules";
import { toD } from "@/lib/decimal";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { approveGiftBillAction, settleGiftsAction } from "@/server/gift-actions";

export async function BrandOperations({ search }: { search: BrandSearch }) {
  const admin = await requireAdmin("PREMIUM");
  const brand = searchValue(search, "brand");
  const settlementTab = searchValue(search, "tab") === "settlements";
  const [gifts, brands] = await Promise.all([
    db.giftOrder.findMany({
      where: brand ? { offer: { sellerId: brand } } : {},
      include: {
        offer: {
          select: { name: true, sellerId: true, seller: { select: { company: true, name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.user.findMany({
      where: { role: "SELLER", isBrand: true, locked: false, ...(brand ? { id: brand } : {}) },
      select: { id: true, name: true, company: true },
    }),
  ]);
  const bills = await db.giftOrder.findMany({
    where: {
      billApprovedAt: { not: null },
      settlementId: null,
      status: { in: ["READY", "DISPATCHED", "DELIVERED"] },
      ...(brand ? { offer: { sellerId: brand } } : {}),
    },
    include: { offer: { select: { sellerId: true, name: true } } },
  });
  return (
    <div className="flex flex-col gap-5">
      {settlementTab && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Sunday settlements</h2>
            <Badge>{formatDate(nextSettlementSunday())}</Badge>
          </div>
          {brands.map((brand) => {
            const own = bills.filter((g) => g.offer.sellerId === brand.id);
            if (!own.length) return null;
            return (
              <Card key={brand.id}>
                <h3 className="mb-3 font-semibold">{brand.company || brand.name}</h3>
                <RewardForm action={settleGiftsAction} submit="Record completed transfer">
                  <input type="hidden" name="brandId" value={brand.id} />
                  {own.map((g) => (
                    <label key={g.id} className="flex min-h-11 items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        name="giftIds"
                        value={g.id}
                        className="size-4 accent-accent"
                      />
                      <span className="min-w-0 flex-1">
                        {giftReference(g.id)} · {g.offer.name}
                      </span>
                      <span className="tabular-nums">{formatLKR(g.partnerPrice)}</span>
                    </label>
                  ))}
                  <p className="text-sm font-medium">
                    All approved bills:{" "}
                    {formatLKR(own.reduce((sum, g) => sum.plus(g.partnerPrice), toD(0)))}
                  </p>
                  <Field label="Bank transfer reference" name={`reference-${brand.id}`}>
                    <Input
                      id={`reference-${brand.id}`}
                      name="reference"
                      minLength={3}
                      maxLength={200}
                      required
                    />
                  </Field>
                </RewardForm>
              </Card>
            );
          })}
          {!bills.length && <EmptyState title="No approved unpaid bills" />}
          <BrandSettlements actorId={admin.id} brandId={brand || undefined} />
        </>
      )}
      {!settlementTab && (
        <>
          <h2 className="text-lg font-semibold">Recent gift orders</h2>
          {gifts.length ? (
            gifts.map((g) => (
              <Card key={g.id} className="flex flex-col gap-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <h3 className="font-medium">{g.offer.name}</h3>
                    <p className="text-xs text-subtle">
                      {g.offer.seller.company || g.offer.seller.name} · {giftReference(g.id)}
                    </p>
                  </div>
                  <Badge tone={g.status === "ISSUE" ? "bad" : "neutral"}>
                    {GIFT_STATUS[g.status]}
                  </Badge>
                </div>
                <p className="text-sm">
                  {g.recipientName} · {formatLKR(g.partnerPrice)} ·{" "}
                  {g.settlementId
                    ? "Settled"
                    : g.billApprovedAt
                      ? "Bill approved"
                      : g.paidAt
                        ? "Awaiting bill approval"
                        : "Unpaid basket"}
                </p>
                {g.issue && <p className="text-sm text-danger">{g.issue}</p>}
                <p className="text-xs text-subtle">
                  {g.acknowledgedAt
                    ? `Brand acknowledged · ${formatDate(g.acknowledgedAt)}`
                    : g.paidAt
                      ? "Awaiting brand acknowledgement"
                      : "Dispatch blocked until basket payment approval"}
                </p>
                <Link
                  href={subjectHref(true, "GIFT", g.id, g.offer.sellerId)}
                  className="inline-flex min-h-11 items-center text-sm font-medium text-accent"
                >
                  Gift discussion & timeline →
                </Link>
                {g.paidAt &&
                  !g.billApprovedAt &&
                  ["READY", "DISPATCHED", "DELIVERED"].includes(g.status) && (
                    <RewardForm action={approveGiftBillAction} submit="Approve gift bill" secondary>
                      <input type="hidden" name="giftId" value={g.id} />
                    </RewardForm>
                  )}
              </Card>
            ))
          ) : (
            <EmptyState title="No gift orders" />
          )}
        </>
      )}
    </div>
  );
}
