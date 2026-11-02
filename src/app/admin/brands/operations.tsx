import Link from "next/link";
import { RewardForm } from "@/components/reward-form";
import { Badge, Card, EmptyState, Field, Input, Select } from "@/components/ui";
import { BrandSearch, searchValue } from "@/components/brand-inbox";
import { subjectHref } from "@/server/brand-communications";
import { BrandSettlements } from "@/components/brand-settlements";
import { formatDate, formatLKR } from "@/lib/format";
import { GIFT_STATUS, giftReference, nextSettlementSunday } from "@/lib/gift-rules";
import { toD } from "@/lib/decimal";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  approveGiftBillAction,
  removeGiftAction,
  reserveGiftAction,
  settleGiftsAction,
} from "@/server/gift-actions";

export async function BrandOperations({ search }: { search: BrandSearch }) {
  const admin = await requireAdmin("PREMIUM");
  const brand = searchValue(search, "brand");
  const settlementTab = searchValue(search, "tab") === "settlements";
  const code = typeof search.cart === "string" ? search.cart.trim().toUpperCase() : "";
  const [cart, offers, gifts, brands] = await Promise.all([
    code
      ? db.groupCart.findUnique({
          where: { code },
          select: {
            id: true,
            code: true,
            status: true,
            total: true,
            expiresAt: true,
            members: { select: { id: true, userId: true, user: { select: { name: true } } } },
          },
        })
      : null,
    db.stockOffer.findMany({
      where: {
        seller: { isBrand: true },
        status: "ACCEPTED",
        paused: false,
        ...(brand ? { sellerId: brand } : {}),
      },
      include: { seller: { select: { company: true, name: true } } },
    }),
    db.giftOrder.findMany({
      where: brand ? { offer: { sellerId: brand } } : {},
      include: {
        offer: {
          select: { name: true, sellerId: true, seller: { select: { company: true, name: true } } },
        },
        cart: { select: { code: true } },
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
      {!settlementTab && (
        <>
          <Card>
            <h2 className="mb-3 font-semibold">Reserve a gift</h2>
            <form className="flex flex-wrap gap-2">
              <input type="hidden" name="tab" value="orders" />
              {brand && <input type="hidden" name="brand" value={brand} />}
              <Input
                name="cart"
                aria-label="Basket code"
                placeholder="Basket code"
                defaultValue={code}
                required
              />
              <button className="min-h-11 rounded-lg border border-line px-4 text-sm font-medium">
                Find basket
              </button>
            </form>
            {code && !cart && <p className="mt-3 text-sm text-danger">Basket not found</p>}
            {cart && (
              <div className="mt-4">
                <p className="text-sm">
                  {cart.code} · {cart.status} · {formatLKR(cart.total)}
                </p>
                {["OPEN", "READY"].includes(cart.status) && cart.expiresAt > new Date() ? (
                  <div className="mt-3">
                    <RewardForm
                      action={reserveGiftAction}
                      submit="Confirm eligibility & reserve gift"
                    >
                      <input type="hidden" name="cartId" value={cart.id} />
                      <Field label="Eligible recipient" name="recipientId">
                        <Select name="recipientId" required defaultValue="">
                          <option value="" disabled>
                            Choose member
                          </option>
                          {cart.members.map((m) => (
                            <option value={m.userId} key={m.id}>
                              {m.user.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Gift product" name="offerId">
                        <Select name="offerId" required defaultValue="">
                          <option value="" disabled>
                            Choose approved product
                          </option>
                          {offers.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.seller.company || o.seller.name} · {o.name} ·{" "}
                              {formatLKR(o.offerPrice ?? 0)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </RewardForm>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-subtle">Basket is locked or expired</p>
                )}
              </div>
            )}
          </Card>
        </>
      )}
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
                      {g.offer.seller.company || g.offer.seller.name} · {giftReference(g.id)} ·{" "}
                      {g.cart.code}
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
                {g.status === "RESERVED" && (
                  <RewardForm action={removeGiftAction} submit="Release reservation" secondary>
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
