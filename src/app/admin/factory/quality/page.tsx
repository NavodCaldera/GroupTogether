import { adminHolds, adminFaults, listHoldMessages } from "@/server/fault-holds";
import { HoldThread, FaultList } from "@/components/fault-bits";
import { FaultForm } from "@/components/fault-form";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, Card, Badge, LinkButton, EmptyState } from "@/components/ui";
import { QualityControl } from "@/components/quality-control";
import { requireUser } from "@/server/auth/session";
import { qualityOverview } from "@/server/quality";
import { formatDateTime } from "@/lib/format";
export const metadata: Metadata = { title: "Quality" };
export default async function QualityPage({ searchParams }: PageProps<"/admin/factory/quality">) {
  const user = await requireUser(["ADMIN"], "/admin/factory/quality");
  if (!["FACTORY", "CORE"].includes(user.adminArea ?? "")) notFound();
  const [data, sp] = await Promise.all([qualityOverview(user.id), searchParams]);
  const [holds, faults] = await Promise.all([adminHolds(user.id), adminFaults(user.id)]);
  const hold = typeof sp.hold === "string" ? holds.find((h) => h.id === sp.hold) : null;
  if (sp.hold && !hold) notFound();
  const messages = hold ? await listHoldMessages(user.id, hold.id) : [];
  const products = data.products.filter(
    (p) =>
      (typeof sp.product !== "string" || p.id === sp.product) && (sp.flagged !== "1" || p.flagged),
  );
  const factories = data.factories.filter((f) => sp.flagged !== "1" || f.flagged);
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader title="Quality" />
      <div className="flex flex-wrap gap-2">
        <LinkButton href="/admin/factory/quality" variant="secondary">
          All
        </LinkButton>
        <LinkButton href="/admin/factory/quality?flagged=1" variant="secondary">
          Flagged
        </LinkButton>
      </div>
      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-lg font-semibold">Fault holds</h2>
        {holds.map((h) => (
          <Card key={h.id} className="flex min-w-0 flex-col gap-3">
            <h3 className="font-semibold">{h.factory.company || h.factory.name}</h3>
            <Badge>{h.decision ?? "On hold"}</Badge>
            <time>{formatDateTime(h.openedAt)}</time>
            {h.decisionNote && <p>{h.decisionNote}</p>}
            <LinkButton href={`/admin/factory/quality?hold=${h.id}`} variant="secondary">
              Hold messages
            </LinkButton>
            {hold?.id === h.id && (
              <HoldThread id={h.id} messages={messages} canPost={!h.decidedAt} />
            )}{" "}
            {!h.decidedAt && <FaultForm id={h.id} op="decide" />}
          </Card>
        ))}
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Faults</h2>
        {data.factories.map((f) => {
          const own = faults.filter((x) => x.factoryId === f.id);
          return own.length ? (
            <Card key={f.id} className="mb-3">
              <h3 className="font-semibold">{f.company || f.name}</h3>
              <FaultList faults={own} admin />
            </Card>
          ) : null;
        })}
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Products</h2>
        {!products.length && <EmptyState title="No products" />}
        <ul className="grid gap-4 lg:grid-cols-2">
          {products.map((p) => (
            <li key={p.id} aria-label={p.title}>
              <Card className="flex min-w-0 flex-col gap-3">
                <h3 className="font-semibold">{p.title}</h3>
                <div className="flex flex-wrap gap-2">
                  {p.flagged && <Badge>Flagged</Badge>}
                  {p.hiddenAt && <Badge>Hidden</Badge>}
                  <span className="text-sm">
                    {p.score.count
                      ? `${p.score.average.toFixed(1)} / 5 (${p.score.count})`
                      : "No ratings"}
                  </span>
                </div>
                {p.productRatings
                  .filter((r) => r.report)
                  .map((r, i) => (
                    <div key={i} className="break-words border-t border-line pt-2 text-sm">
                      <p>
                        {r.stars} / 5 | {r.report!.reason.replaceAll("_", " ").toLowerCase()}
                      </p>
                      <p>{r.report!.note}</p>
                      <time>{formatDateTime(r.createdAt)}</time>
                      <div className="flex flex-wrap gap-3">
                        {r.report!.photos.map((photo, n) => (
                          <a
                            key={photo.id}
                            href={`/api/report-photos/${photo.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                          >
                            Photo {n + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                <QualityControl
                  key={p.hiddenAt?.toISOString() ?? p.id}
                  kind="product"
                  id={p.id}
                  reason={p.hiddenReason ?? ""}
                  finished={p.hiddenAt !== null}
                />
              </Card>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Factories</h2>
        {!factories.length && <EmptyState title="No factories" />}
        <ul className="grid gap-4 lg:grid-cols-2">
          {factories.map((f) => (
            <li key={f.id} aria-label={f.company || f.name}>
              <Card className="flex min-w-0 flex-col gap-3">
                <h3 className="font-semibold">{f.company || f.name}</h3>
                <div className="flex flex-wrap gap-2">
                  {f.flagged && <Badge>Flagged</Badge>}
                  <Badge>{f.factoryProfile?.status ?? "No profile"}</Badge>
                  <span className="text-sm">
                    {f.score.count
                      ? `${f.score.average.toFixed(1)} / 5 (${f.score.count})`
                      : "No ratings"}
                  </span>
                  <span className="text-sm">{f.flaggedProducts} flagged products</span>
                </div>
                {f.factoryProfile && (
                  <QualityControl
                    key={f.factoryProfile.removedAt?.toISOString() ?? f.id}
                    kind="factory"
                    id={f.id}
                    finished={f.factoryProfile.status === "REMOVED"}
                    reason={f.factoryProfile.removalReason ?? ""}
                    earningsHeld={f.factoryProfile.earningsHeld}
                    note={f.factoryProfile.earningsHeldNote ?? ""}
                  />
                )}
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
