import Link from "next/link";
import { GiftProductDetails } from "@/components/gift-product-details";
import { BrandInbox } from "@/components/brand-inbox";
import { BrandSettlements } from "@/components/brand-settlements";
import { BrandLiveUpdates } from "@/components/brand-live-updates";
import { brandInbox, subjectHref } from "@/server/brand-communications";
import { acknowledgeGiftAction } from "@/server/brand-communication-actions";
import {
  Badge,
  Card,
  EmptyState,
  Field,
  Input,
  LinkButton,
  Select,
  Textarea,
  cx,
} from "@/components/ui";
import { RewardForm } from "@/components/reward-form";
import { discountPct, siteName } from "@/lib/brand-rules";
import { toD } from "@/lib/decimal";
import { formatDate, formatDateTime, formatLKR } from "@/lib/format";
import { GIFT_STATUS, giftReference, nextSettlementSunday } from "@/lib/gift-rules";
import { availabilityAction, giftDeliveryAction } from "@/server/gift-actions";
import { brandDashboard } from "@/server/gifts";

type Search = { [key: string]: string | string[] | undefined };

export async function BrandDashboard({ brandId, search }: { brandId: string; search: Search }) {
  const { brand, offers, gifts, settlements } = await brandDashboard(brandId);
  const inbox = await brandInbox(brandId);
  const unread = inbox.reduce((sum, thread) => sum + thread.unread, 0);
  // Gift orders and settlements are parked with the old baskets: their tabs are hidden.
  const tab = ["products", "messages"].includes(String(search.tab))
    ? String(search.tab)
    : "overview";
  const q = typeof search.q === "string" ? search.q.trim().slice(0, 100) : "";
  const status = typeof search.status === "string" ? search.status : "";
  const ready = gifts.filter((g) => g.status === "READY");
  const issues = gifts.filter((g) => g.status === "ISSUE");
  const unpaid = gifts.filter((g) => !g.settlementId && g.status !== "CANCELLED");
  const approved = unpaid.filter((g) => g.billApprovedAt && g.status !== "ISSUE");
  const sum = (rows: typeof gifts) => rows.reduce((s, g) => s.plus(g.partnerPrice), toD(0));
  const delivered = gifts.filter((g) => g.status === "DELIVERED");
  const filtered = gifts.filter(
    (g) =>
      (!status || g.status === status) &&
      (!q ||
        `${g.offer.name} ${giftReference(g.id)} ${g.recipientName}`
          .toLowerCase()
          .includes(q.toLowerCase())),
  );
  const shownOrders = tab === "overview" ? [...issues, ...ready].slice(0, 6) : filtered;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {tab !== "messages" && <BrandLiveUpdates />}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent"
            aria-hidden="true"
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8H8.5A2.5 2.5 0 1 1 11 5.5L12 8Zm0 0h3.5A2.5 2.5 0 1 0 13 5.5L12 8Z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wider text-subtle uppercase">
              Brand partner
            </p>
            <h1 className="text-2xl font-semibold tracking-tight break-words">
              {brand.company || brand.name}
            </h1>
            {brand.website && (
              <a
                href={brand.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent hover:underline"
              >
                {siteName(brand.website)} ↗
              </a>
            )}
          </div>
        </div>
        <LinkButton href="/seller/new">+ Add gift product</LinkButton>
      </header>

      <nav
        aria-label="Brand dashboard"
        className="grid grid-cols-2 gap-1 border-b border-line pb-2 text-sm sm:flex"
      >
        {[
          ["overview", "Overview"],
          ["products", "Gift products"],
          ["messages", "Messages"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`/seller?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={cx(
              "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4",
              tab === key ? "bg-accent text-on-accent font-medium" : "text-subtle hover:bg-muted",
            )}
          >
            {label}
            {key === "messages" && unread > 0 && (
              <span className="text-xs tabular-nums">{unread}</span>
            )}
            {key === "orders" && ready.length > 0 && (
              <span className="text-xs tabular-nums">{ready.length}</span>
            )}
          </Link>
        ))}
      </nav>
      {tab === "messages" && <BrandInbox actorId={brandId} search={search} />}

      {(tab === "overview" || tab === "settlements") && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label="Awaiting dispatch"
            value={String(ready.length)}
            href="/seller?tab=orders&status=READY"
          />
          <Metric
            label="In baskets"
            value={String(offers.reduce((n, o) => n + o.reserved, 0))}
            href="/seller?tab=products"
          />
          <Metric
            label="Approved unpaid"
            value={formatLKR(sum(approved))}
            href="/seller?tab=settlements"
          />
          <Metric
            label="Next settlement"
            value={`Sun, ${formatDate(nextSettlementSunday())}`}
            href="/seller?tab=settlements"
          />
        </div>
      )}

      {(tab === "overview" || tab === "orders") && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {tab === "overview" ? "Needs attention" : "Gift orders"}
            </h2>
            {tab === "overview" && (
              <Link href="/seller?tab=orders" className="text-sm font-medium text-accent">
                View all →
              </Link>
            )}
            {issues.length > 0 && (
              <Badge tone="bad">
                {issues.length} delivery {issues.length === 1 ? "issue" : "issues"}
              </Badge>
            )}
          </div>
          {tab === "orders" && (
            <form className="flex flex-col gap-2 sm:flex-row" role="search">
              <input type="hidden" name="tab" value="orders" />
              <Input
                name="q"
                aria-label="Search gift orders"
                placeholder="Gift reference, product or recipient"
                defaultValue={q}
                className="sm:flex-1"
              />
              <Select name="status" aria-label="Order status" defaultValue={status}>
                <option value="">All orders</option>
                {Object.entries(GIFT_STATUS)
                  .filter(([key]) => key !== "RESERVED")
                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
              </Select>
              <button className="min-h-11 rounded-lg border border-line px-4 text-sm font-medium">
                Search
              </button>
            </form>
          )}
          {shownOrders.length ? (
            shownOrders.map((g) => (
              <Card key={g.id} className="flex flex-col gap-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="text-xs text-subtle tabular-nums">
                      {giftReference(g.id)} · {formatDate(g.paidAt)}
                    </p>
                    <h3 className="font-semibold">{g.offer.name}</h3>
                  </div>
                  <Badge
                    tone={g.status === "ISSUE" ? "bad" : g.status === "DELIVERED" ? "good" : "info"}
                  >
                    {GIFT_STATUS[g.status]}
                  </Badge>
                </div>
                <div className="grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="font-medium">{g.recipientName}</p>
                    <p className="break-words text-subtle">
                      {g.address}, {g.city}
                    </p>
                    <a
                      href={`tel:${g.phone}`}
                      className="inline-flex min-h-10 items-center text-accent"
                    >
                      {g.phone}
                    </a>
                  </div>
                  <dl className="grid grid-cols-2 gap-2">
                    <div>
                      <dt className="text-xs text-subtle">Partner charge</dt>
                      <dd className="font-medium tabular-nums">{formatLKR(g.partnerPrice)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-subtle">Gift delivery</dt>
                      <dd>Customer pays</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-subtle">Payment</dt>
                      <dd>
                        {g.settlementId
                          ? "Settled"
                          : g.billApprovedAt
                            ? "Approved unpaid"
                            : "Awaiting bill review"}
                      </dd>
                    </div>
                    {g.tracking && (
                      <div>
                        <dt className="text-xs text-subtle">{g.courier}</dt>
                        <dd className="break-all">{g.tracking}</dd>
                      </div>
                    )}
                  </dl>
                </div>
                {g.issue && (
                  <p
                    role="status"
                    className="rounded-lg border border-danger p-3 text-sm text-danger"
                  >
                    {g.issue}
                  </p>
                )}
                <Link
                  href={subjectHref(false, "GIFT", g.id)}
                  className="inline-flex min-h-11 items-center text-sm font-medium text-accent"
                >
                  Gift discussion & timeline →
                </Link>
                {g.acknowledgedAt && (
                  <p className="text-xs text-subtle">
                    Acknowledged {formatDateTime(g.acknowledgedAt)}
                  </p>
                )}
                {g.status === "READY" && !g.acknowledgedAt && (
                  <RewardForm action={acknowledgeGiftAction} submit="Acknowledge order" secondary>
                    <input type="hidden" name="giftId" value={g.id} />
                  </RewardForm>
                )}
                {["READY", "ISSUE"].includes(g.status) && (
                  <details className="border-t border-line pt-3">
                    <summary className="min-h-10 cursor-pointer text-sm font-medium text-accent">
                      Record dispatch
                    </summary>
                    <RewardForm action={giftDeliveryAction} submit="Mark dispatched">
                      <input type="hidden" name="giftId" value={g.id} />
                      <input type="hidden" name="event" value="dispatch" />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Courier" name={`courier-${g.id}`}>
                          <Input
                            id={`courier-${g.id}`}
                            name="courier"
                            maxLength={100}
                            defaultValue={g.courier ?? ""}
                            required
                          />
                        </Field>
                        <Field label="Tracking reference" name={`tracking-${g.id}`}>
                          <Input
                            id={`tracking-${g.id}`}
                            name="tracking"
                            maxLength={200}
                            defaultValue={g.tracking ?? ""}
                            required
                          />
                        </Field>
                      </div>
                    </RewardForm>
                  </details>
                )}
                {g.status === "DISPATCHED" && (
                  <RewardForm action={giftDeliveryAction} submit="Mark delivered">
                    <input type="hidden" name="giftId" value={g.id} />
                    <input type="hidden" name="event" value="deliver" />
                  </RewardForm>
                )}
                {["READY", "DISPATCHED"].includes(g.status) && (
                  <details>
                    <summary className="min-h-10 cursor-pointer text-sm text-subtle">
                      Report a delivery issue
                    </summary>
                    <RewardForm action={giftDeliveryAction} submit="Report issue" secondary>
                      <input type="hidden" name="giftId" value={g.id} />
                      <input type="hidden" name="event" value="issue" />
                      <Textarea
                        name="issue"
                        aria-label="Delivery issue"
                        maxLength={500}
                        minLength={3}
                        required
                      />
                    </RewardForm>
                  </details>
                )}
              </Card>
            ))
          ) : (
            <EmptyState
              title={tab === "overview" ? "No gifts awaiting action" : "No matching gift orders"}
            />
          )}
        </section>
      )}

      {tab === "products" && (
        <section className="grid gap-4 md:grid-cols-2">
          {offers.length ? (
            offers.map((o) => (
              <Card key={o.id} className="flex min-w-0 flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="min-w-0 font-semibold break-words">{o.name}</h2>
                  <Badge
                    tone={
                      o.status === "DECLINED"
                        ? "bad"
                        : o.status === "ACCEPTED" && !o.paused
                          ? "good"
                          : "neutral"
                    }
                  >
                    {o.status === "IN_REVIEW"
                      ? "In review"
                      : o.status === "CHANGES_REQUESTED"
                        ? "Changes requested"
                        : o.status === "DECLINED"
                          ? "Declined"
                          : o.paused
                            ? "Paused"
                            : o.available
                              ? "Active"
                              : "Out of stock"}
                  </Badge>
                </div>
                <GiftProductDetails offer={o} />
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-subtle">Retail value</dt>
                    <dd className="mt-1 font-medium tabular-nums">
                      {formatLKR(o.actualPrice ?? 0)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-subtle">Partner price</dt>
                    <dd className="mt-1 font-medium tabular-nums">
                      {formatLKR(o.offerPrice ?? 0)}{" "}
                      <span className="text-xs text-accent">
                        {o.actualPrice && o.offerPrice
                          ? `${discountPct(o.actualPrice, o.offerPrice)}% off`
                          : ""}
                      </span>
                    </dd>
                  </div>
                </dl>
                <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted p-3 text-center">
                  <Count label="Available" value={o.available} />
                  <Count label="In baskets" value={o.reserved} />
                  <Count label="Paid orders" value={o.allocated - o.reserved} />
                </div>
                {o.productUrl && (
                  <a
                    href={o.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent hover:underline"
                  >
                    View on brand website ↗
                  </a>
                )}
                {o.note && <p className="rounded-lg bg-muted p-3 text-sm">{o.note}</p>}
                {o.revisions[0] && (
                  <p className="text-xs text-subtle">
                    Latest submission: Revision {o.revision} ·{" "}
                    {o.revisions[0].status.replaceAll("_", " ")}
                    {o.approvedRevision ? ` · Live revision ${o.approvedRevision}` : ""}
                  </p>
                )}
                <Link
                  href={subjectHref(false, "PRODUCT", o.id)}
                  className="inline-flex min-h-11 items-center text-sm font-medium text-accent"
                >
                  Discuss product & review history →
                </Link>
                <details>
                  <summary className="min-h-11 cursor-pointer text-sm">Revision history</summary>
                  <ol className="flex flex-col gap-2 text-sm">
                    {o.revisions.map((revision) => (
                      <li key={revision.id}>
                        Revision {revision.version} · {revision.status.replaceAll("_", " ")} ·{" "}
                        {formatDateTime(revision.createdAt)}
                      </li>
                    ))}
                  </ol>
                </details>
                {
                  <Link
                    href={`/seller/new?offerId=${o.id}`}
                    className="inline-flex min-h-11 items-center text-sm font-medium text-accent"
                  >
                    {o.status === "ACCEPTED" ? "Propose revised terms →" : "Revise submission →"}
                  </Link>
                }
                <details className="border-t border-line pt-3">
                  <summary className="min-h-10 cursor-pointer text-sm font-medium">
                    Manage availability
                  </summary>
                  <RewardForm action={availabilityAction} submit="Save availability" secondary>
                    <input type="hidden" name="offerId" value={o.id} />
                    <Field label="Total campaign quantity" name={`pieces-${o.id}`}>
                      <Input
                        id={`pieces-${o.id}`}
                        name="pieces"
                        type="number"
                        min={o.allocated}
                        max={100000}
                        defaultValue={o.pieces ?? 0}
                        required
                      />
                    </Field>
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        name="paused"
                        type="checkbox"
                        defaultChecked={o.paused}
                        className="size-4 accent-accent"
                      />
                      Pause new reservations
                    </label>
                  </RewardForm>
                </details>
              </Card>
            ))
          ) : (
            <div className="md:col-span-2">
              <EmptyState title="No gift products yet">
                <Link href="/seller/new" className="text-accent underline">
                  Add gift product
                </Link>
              </EmptyState>
            </div>
          )}
        </section>
      )}

      {tab === "settlements" && (
        <section className="flex flex-col gap-5">
          <Card>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="text-xs text-subtle">Awaiting bill review</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {formatLKR(sum(unpaid.filter((g) => !g.billApprovedAt || g.status === "ISSUE")))}
                </p>
              </div>
              <div>
                <p className="text-xs text-subtle">Transfers recorded</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {formatLKR(settlements.reduce((s, p) => s.plus(p.amount), toD(0)))}
                </p>
              </div>
              <Badge>Weekly · Sunday</Badge>
            </div>
          </Card>
          <h2 className="text-lg font-semibold">Unpaid gift charges</h2>
          {unpaid.length ? (
            <Card className="divide-y divide-line">
              {unpaid.map((g) => (
                <div
                  key={g.id}
                  className="flex flex-wrap justify-between gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium">{g.offer.name}</p>
                    <p className="text-xs text-subtle">
                      {giftReference(g.id)} ·{" "}
                      {g.status === "ISSUE"
                        ? "On hold · delivery issue"
                        : g.billApprovedAt
                          ? "Approved"
                          : "Awaiting review"}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">{formatLKR(g.partnerPrice)}</p>
                </div>
              ))}
            </Card>
          ) : (
            <EmptyState title="No unpaid gift charges" />
          )}
          <BrandSettlements actorId={brandId} />
        </section>
      )}

      {tab === "overview" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric
            label="Gifts delivered"
            value={String(delivered.length)}
            href="/seller?tab=orders&status=DELIVERED"
          />
          <Metric
            label="Retail value distributed"
            value={formatLKR(delivered.reduce((s, g) => s.plus(g.retailValue), toD(0)))}
            href="/seller?tab=orders&status=DELIVERED"
          />
          <Metric
            label="Active gift products"
            value={String(
              offers.filter((o) => o.status === "ACCEPTED" && !o.paused && o.available > 0).length,
            )}
            href="/seller?tab=products"
          />
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link
      href={href}
      className="min-w-0 rounded-xl border border-line bg-paper p-4 transition hover:border-accent"
    >
      <p className="text-xs text-subtle">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight break-words tabular-nums sm:text-2xl">
        {value}
      </p>
    </Link>
  );
}
function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-subtle">{label}</p>
    </div>
  );
}
