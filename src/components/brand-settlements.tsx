import Link from "next/link";
import { db } from "@/server/db";
import { communicationActor, subjectHref } from "@/server/brand-communications";
import { settlementResponseAction } from "@/server/brand-communication-actions";
import { formatDateTime, formatLKR } from "@/lib/format";
import { giftReference } from "@/lib/gift-rules";
import { Badge, Card, EmptyState, Field, Textarea } from "./ui";
import { RewardForm } from "./reward-form";
export async function BrandSettlements({
  actorId,
  brandId,
}: {
  actorId: string;
  brandId?: string;
}) {
  const actor = await communicationActor(actorId);
  const admin = actor.role === "ADMIN";
  const settlements = await db.giftSettlement.findMany({
    where: { ...(!admin ? { brandId: actorId } : brandId ? { brandId } : {}) },
    include: {
      brand: { select: { company: true, name: true } },
      gifts: { select: { id: true, partnerPrice: true, offer: { select: { name: true } } } },
    },
    orderBy: { paidAt: "desc" },
    take: 100,
  });
  const names = new Map(
    (
      await db.user.findMany({
        where: { id: { in: settlements.map((payment) => payment.settledById) } },
        select: { id: true, name: true },
      })
    ).map((user) => [user.id, user.name]),
  );
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Payment history</h2>
      {!settlements.length && <EmptyState title="No settlements recorded" />}
      {settlements.map((payment) => (
        <Card key={payment.id} className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <p className="font-medium break-words">{payment.reference}</p>
              <p className="text-xs text-subtle">
                {admin ? `${payment.brand.company || payment.brand.name} · ` : ""}
                {formatDateTime(payment.paidAt)} · Recorded by{" "}
                {names.get(payment.settledById) || "Admin"}
              </p>
            </div>
            <p className="font-semibold tabular-nums">{formatLKR(payment.amount)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={payment.queryOpen ? "bad" : "good"}>
              {payment.queryOpen ? "Payment query open" : "Transfer recorded"}
            </Badge>
            {payment.receivedAt && (
              <Badge tone="info">Receipt confirmed {formatDateTime(payment.receivedAt)}</Badge>
            )}
          </div>
          <details>
            <summary className="min-h-11 cursor-pointer text-sm">
              Statement · {payment.gifts.length} {payment.gifts.length === 1 ? "gift" : "gifts"}
            </summary>
            <ul className="divide-y divide-line">
              {payment.gifts.map((gift) => (
                <li key={gift.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                  <span>
                    {giftReference(gift.id)} · {gift.offer.name}
                  </span>
                  <span>{formatLKR(gift.partnerPrice)}</span>
                </li>
              ))}
            </ul>
            <p className="border-t border-line py-2 text-right text-sm font-semibold">
              Total {formatLKR(payment.amount)}
            </p>
          </details>
          <Link
            href={subjectHref(admin, "SETTLEMENT", payment.id, payment.brandId)}
            className="inline-flex min-h-11 items-center text-sm font-medium text-accent"
          >
            Discuss payment →
          </Link>
          {!admin && !payment.receivedAt && (
            <RewardForm
              action={settlementResponseAction}
              submit="Confirm payment received"
              secondary
            >
              <input type="hidden" name="settlementId" value={payment.id} />
              <input type="hidden" name="event" value="received" />
            </RewardForm>
          )}
          {(!admin || payment.queryOpen) && (
            <details>
              <summary className="min-h-11 cursor-pointer text-sm text-accent">
                {admin ? "Resolve payment query" : "Raise a payment query"}
              </summary>
              <RewardForm
                action={settlementResponseAction}
                submit={admin ? "Record query resolution" : "Send payment query"}
                secondary
              >
                <input type="hidden" name="settlementId" value={payment.id} />
                <input type="hidden" name="event" value={admin ? "resolve-query" : "query"} />
                <Field
                  label={admin ? "Resolution shared with brand" : "Payment query"}
                  name={`query-${payment.id}`}
                >
                  <Textarea
                    id={`query-${payment.id}`}
                    name="note"
                    required
                    minLength={3}
                    maxLength={2000}
                    rows={2}
                  />
                </Field>
              </RewardForm>
            </details>
          )}
        </Card>
      ))}
    </section>
  );
}
