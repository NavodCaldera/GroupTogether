import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/client";
import { FeelBar } from "@/components/materials/feel-bar";
import { Badge, Card, PageHeader } from "@/components/ui";
import { axisText } from "@/lib/materials/card";
import { requireAdmin } from "@/server/auth/session";
import { libraryProfile } from "@/server/materials";

export const metadata: Metadata = { title: "Material" };

/**
 * One library material (DEC-022): its library estimate and, under each value, "Why this
 * value?": the rule and version, the evidence with its quote and source.
 */
export default async function MaterialAdminPage({
  params,
}: PageProps<"/admin/factory/materials/[code]">) {
  await requireAdmin("FACTORY");
  const p = await libraryProfile((await params).code);
  if (!p) notFound();
  const { material: m } = p;
  const byCode = new Map(p.evidence.map((e) => [e.code, e]));
  const rule = (code: string, version: number) =>
    p.rules.find((r) => r.code === code && r.version === version);
  return (
    <>
      <BackLink fallback="/admin/factory/materials" />
      <PageHeader
        title={m.displayName}
        actions={
          <Badge tone={m.status === "PUBLISHED" ? "good" : "neutral"}>
            {m.status === "PUBLISHED" ? "Published" : "Draft"}
          </Badge>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-subtle">Code</dt>
            <dd>{m.code}</dd>
            <dt className="text-subtle">Construction</dt>
            <dd>{m.construction.name}</dd>
            <dt className="text-subtle">Yarn</dt>
            <dd>{m.yarnProcess?.name ?? "—"}</dd>
            <dt className="text-subtle">Finish</dt>
            <dd>{m.finish.name}</dd>
            <dt className="text-subtle">GSM</dt>
            <dd>{m.defaultGsmMin != null ? `${m.defaultGsmMin}–${m.defaultGsmMax}` : "—"}</dd>
            <dt className="text-subtle">Composition</dt>
            <dd>
              {m.fibers
                .map(
                  (f) =>
                    `${f.percentage}% ${f.fiberStandard ? `${f.fiberStandard.name} ` : ""}${f.fiber.name}`,
                )
                .join(", ")}
            </dd>
            <dt className="text-subtle">Feels like</dt>
            <dd>{m.feelsLikeAnchor ?? "—"}</dd>
          </dl>
        </Card>
        <Card className="flex flex-col gap-4">
          {p.axes.map((a) => {
            const r = a.rule ? rule(a.rule.code, a.rule.version) : null;
            return (
              <div key={a.axis} className="flex flex-col gap-1">
                <FeelBar axis={a} text={axisText(a)} showText />
                {a.basis !== "NOT_AVAILABLE" && (
                  <details className="text-sm">
                    <summary className="flex min-h-11 cursor-pointer items-center sm:min-h-9">
                      Why this value?
                    </summary>
                    {r && (
                      <p className="mb-1">
                        <span className="font-medium">
                          {r.code} v{r.version}
                        </span>{" "}
                        <span className="text-subtle">{r.formula}</span>
                      </p>
                    )}
                    <ul className="flex flex-col gap-1">
                      {a.evidenceCodes.map((c) => {
                        const e = byCode.get(c);
                        return (
                          <li key={c} className="break-words">
                            {c}: {e?.claim}
                            {e?.excerpt && <q className="block text-subtle">{e.excerpt}</q>}
                            {e && (
                              <a href={e.source.url} className="text-accent underline">
                                {e.source.code} · tier {e.source.tier}
                              </a>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}
              </div>
            );
          })}
        </Card>
      </div>
      <h2 className="mt-6 mb-2 text-lg font-semibold">Evidence</h2>
      <Card>
        <ul className="flex flex-col divide-y divide-line text-sm">
          {p.evidence.map((e) => (
            <li key={e.code} className="py-2 break-words first:pt-0 last:pb-0">
              <span className="font-medium">{e.code}</span>{" "}
              <span className="text-subtle">
                {e.subjectType} {e.subjectCode} · {e.attribute}
              </span>
              <span className="block">{e.claim}</span>
              {e.excerpt ? (
                <q className="block text-subtle">{e.excerpt}</q>
              ) : (
                <Badge tone="neutral">No quote: not used</Badge>
              )}
              <a href={e.source.url} className="text-accent underline">
                {e.source.publisher} · tier {e.source.tier}
              </a>
              {e.locator && <span className="text-subtle"> · {e.locator}</span>}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
