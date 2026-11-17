import Link from "next/link";
import { Badge } from "@/components/ui";
import { BADGE_LABEL, type MaterialCard, type MeasuredFigure } from "@/lib/materials/card";
import type { Sourced } from "@/lib/materials/types";
import type { getProvenance } from "@/server/materials";
import { FeelBar } from "./feel-bar";

export type Why = Awaited<ReturnType<typeof getProvenance>>;

const STANDARD = (s: string) => s.replace(/_/g, " ");

function figure(s: Sourced<MeasuredFigure> | null) {
  if (!s) return null;
  const f = s.value;
  return `${f.value} ${f.unit} · ${STANDARD(f.standard)}${f.accredited ? "" : " · not accredited"}`;
}

/**
 * The buyer Material Card (DEC-022), in the order of the spec: header and badge, feels-like,
 * the four feel bars, on skin and made for, video, details, care, "How we know this", compare.
 */
export function MaterialCardView({
  card,
  why,
  compareHref,
}: {
  card: MaterialCard;
  why: Why | null;
  compareHref?: string;
}) {
  const d = card.details;
  const details: [string, string | null][] = [
    ["Weight", `${d.weight.value.gsm} gsm · ${d.weight.value.caption}`],
    ["Composition", d.composition.value],
    ["Construction", d.construction?.value ?? null],
    ["Stretch", figure(d.stretch)],
    ["Air permeability", figure(d.breathability)],
    ["Shrinkage", figure(d.shrinkage)],
  ];
  return (
    <div className="flex flex-col gap-4" data-testid="material-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold">{card.displayName}</h3>
          {card.feelsLike && (
            <p className="text-sm text-subtle">Feels like {card.feelsLike.value}</p>
          )}
        </div>
        <Badge tone={card.badge === "LAB_MEASURED" ? "good" : "info"}>
          {BADGE_LABEL[card.badge]}
        </Badge>
      </div>

      {card.adjectives && (
        <p className="text-sm capitalize">{card.adjectives.value.join(" · ")}</p>
      )}

      <div className="flex flex-col gap-3">
        {card.axes.map((a) => (
          <FeelBar key={a.axis} axis={a} text={a.text} />
        ))}
      </div>

      {(card.onSkin || card.madeFor) && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {card.onSkin && (
            <>
              <dt className="text-subtle">On skin</dt>
              <dd>{card.onSkin.value}</dd>
            </>
          )}
          {card.madeFor && (
            <>
              <dt className="text-subtle">Made for</dt>
              <dd>{card.madeFor.value.join(", ")}</dd>
            </>
          )}
        </dl>
      )}

      {card.videoUrl && (
        <video
          src={card.videoUrl}
          controls
          muted
          playsInline
          preload="metadata"
          className="aspect-video w-full rounded-lg bg-muted"
          aria-label={`${card.displayName} in motion`}
        />
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {details.map(([k, v]) =>
          v ? (
            <div key={k} className="contents">
              <dt className="text-subtle">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ) : null,
        )}
      </dl>

      {card.care && <p className="whitespace-pre-line text-sm text-subtle">{card.care.value}</p>}

      {why && <HowWeKnow why={why} />}

      {compareHref && (
        <Link
          href={compareHref}
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline sm:min-h-10"
        >
          Compare
        </Link>
      )}
    </div>
  );
}

export function HowWeKnow({ why }: { why: Why }) {
  return (
    <details className="rounded-lg border border-line p-3 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center font-medium sm:min-h-10">
        How we know this
      </summary>
      <div className="mt-2 flex flex-col gap-3">
        {why.measurements.length > 0 && (
          <ul className="flex flex-col gap-1">
            {why.measurements.map((m) => (
              <li key={m.id}>
                {STANDARD(m.testStandard)}: {m.value} · {m.labName},{" "}
                {m.testedOn.toISOString().slice(0, 10)}
                {m.accredited ? "" : " · not accredited"}
              </li>
            ))}
          </ul>
        )}
        {why.rules.length > 0 && (
          <ul className="flex flex-col gap-2">
            {why.rules.map((r) => (
              <li key={`${r.code}@${r.version}`}>
                <span className="font-medium">
                  {r.code} v{r.version}
                </span>{" "}
                <span className="text-subtle">{r.ruleDescription}</span>
              </li>
            ))}
          </ul>
        )}
        {why.evidence.length > 0 && (
          <ul className="flex flex-col gap-2">
            {why.evidence.map((e) => (
              <li key={e.code} className="min-w-0 break-words">
                {e.claim}
                {e.excerpt && <q className="block text-subtle">{e.excerpt}</q>}
                <a
                  href={e.source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-accent underline"
                >
                  {e.source.publisher}
                </a>
                {e.locator && <span className="text-subtle"> · {e.locator}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
