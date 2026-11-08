import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AgentShell, AgentStatusBadge, Section } from "@/components/agent-shell";
import { Countdown } from "@/components/client";
import { Badge, Card } from "@/components/ui";
import { formatDate, formatDateTime, formatLKR } from "@/lib/format";
import {
  agentTokens,
  arriving,
  basketsFilling,
  returnsToCollect,
  waitingForPickup,
} from "@/server/agents/screens";
import { getCurrentUser, requireAgent } from "@/server/auth/session";
import { CollectButton, HandOverBox, ReceiveForm } from "./agent-forms";

export const metadata: Metadata = { title: "Agent" };

export default async function AgentHome() {
  // Applicants are still buyers; their application and deposit live on the apply page.
  const me = await getCurrentUser();
  if (me && me.role === "CUSTOMER") redirect("/agents/apply");
  const user = await requireAgent();
  const { agent } = user;
  const [coming, waiting, toCollect, filling, tokens] = await Promise.all([
    arriving(agent.id),
    waitingForPickup(agent.id),
    returnsToCollect(agent.id),
    basketsFilling(agent.id),
    agentTokens(agent),
  ]);
  const items = waiting.reduce((n, w) => n + w.items, 0);

  return (
    <AgentShell active="home" title="Agent" badge={<AgentStatusBadge status={agent.status} />}>
      <Section title="Hand over">
        <Card>
          <HandOverBox />
        </Card>
      </Section>

      {coming.length > 0 && (
        <Section title="Arriving today" count={coming.length}>
          {coming.map((b) => (
            <Card key={b.id} className="flex flex-col gap-3 border-accent">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{b.factory}</p>
                <span className="text-sm text-subtle">{b.orders} orders</span>
              </div>
              {b.courier && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-subtle">Driver</dt>
                  <dd>{b.courier.driverName}</dd>
                  <dt className="text-subtle">Phone</dt>
                  <dd>
                    <a href={`tel:${b.courier.driverPhone}`} className="underline">
                      {b.courier.driverPhone}
                    </a>
                  </dd>
                  <dt className="text-subtle">Vehicle</dt>
                  <dd>{b.courier.vehicleNo}</dd>
                  <dt className="text-subtle">Fee</dt>
                  <dd className="font-semibold tabular-nums">{formatLKR(b.courier.fee)}</dd>
                </dl>
              )}
              <ReceiveForm
                basketId={b.id}
                returns={b.returns.map((r) => ({ id: r.id, item: r.item, qty: r.qty }))}
              />
            </Card>
          ))}
        </Section>
      )}

      <Section
        title="Waiting for pickup"
        count={items}
        action={
          waiting.length > 0 ? (
            <Link href="/agent/pickups" className="text-sm underline">
              All
            </Link>
          ) : undefined
        }
      >
        {waiting.length === 0 ? (
          <p className="text-sm text-subtle">None</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {waiting.slice(0, 5).map((w) => (
              <li key={w.buyerId} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                <span className="font-medium">{w.name}</span>
                <span className="text-sm text-subtle tabular-nums">
                  {w.items} items · {formatLKR(w.fee)} · {formatDate(w.receivedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Returns to collect" count={toCollect.length}>
        {toCollect.length === 0 ? (
          <p className="text-sm text-subtle">None</p>
        ) : (
          toCollect.map((r) => (
            <Card key={r.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{r.buyer}</p>
                {r.dueAt && (
                  <span className="text-sm text-warn">
                    <Countdown until={r.dueAt.toISOString()} />
                  </span>
                )}
              </div>
              <p className="text-sm">
                {r.item} × {r.qty}
              </p>
              <CollectButton returnId={r.id} />
            </Card>
          ))
        )}
      </Section>

      <Section title="Open baskets" count={filling.baskets.length}>
        {filling.baskets.length === 0 ? (
          <p className="text-sm text-subtle">None</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filling.baskets.map((b) => {
              const pct = b.total.div(filling.lockAt).times(100).clamp(0, 100).toFixed(0);
              return (
                <li key={b.id} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{b.factory}</span>
                    {b.status === "OPEN" ? (
                      <span className="text-sm tabular-nums">
                        {formatLKR(b.total)} / {formatLKR(filling.lockAt)}
                      </span>
                    ) : (
                      <Badge>{b.status === "LOCKED" ? "Packing" : "Packed"}</Badge>
                    )}
                  </div>
                  {b.status === "OPEN" && (
                    <>
                      <div
                        role="progressbar"
                        aria-label={`${b.factory} basket`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Number(pct)}
                        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                      >
                        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                      {b.shipsBy && (
                        <p className="mt-1 text-xs text-warn">
                          Ships by {formatDateTime(b.shipsBy)}
                        </p>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        title="Tokens"
        action={
          <Link href="/agent/tokens" className="text-sm underline">
            Open
          </Link>
        }
      >
        <Card className="flex flex-wrap justify-between gap-3">
          <div>
            <p className="text-2xl font-semibold tabular-nums">{formatLKR(tokens.balance)}</p>
            <p className="text-sm text-subtle">Balance</p>
          </div>
          <div className="text-right">
            <p className="font-semibold tabular-nums">{formatLKR(tokens.fees)}</p>
            <p className="text-sm text-subtle">Agent fees</p>
          </div>
        </Card>
      </Section>
    </AgentShell>
  );
}
