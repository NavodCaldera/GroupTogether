"use client";

/**
 * Product page fit module (DEC-020): the 3D heatmap viewer, when the garment has a simulation
 * for the buyer's archetype, beside the fit report. Every size's tensions arrive at once, so
 * the size switch recolours instantly.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { heatCss, RAMP_CSS, shownTension } from "@/lib/fit/colour";
import { REGION_ID, REGION_LABEL } from "@/lib/fit/regions";
import { band as bandOf, type Band, type FitReport } from "@/lib/fit/report";

const FitViewer = lazy(() => import("./fit-viewer"));

const MOTIONS = [
  { id: "WALK", label: "Walk" },
  { id: "RUN", label: "Run" },
  { id: "REACH", label: "Reach" },
  { id: "SIT", label: "Sit" },
] as const;
type Motion = (typeof MOTIONS)[number]["id"];

const VERDICT: Record<Band, string> = {
  loose: "Loose",
  comfortable: "Comfortable",
  snug: "Snug",
  tight: "Tight",
};

const CONFIDENCE = { high: "High", medium: "Medium", low: "Low" } as const;

const chip = (on: boolean) =>
  cx(
    "min-h-11 min-w-11 rounded-lg border px-3 text-sm font-medium sm:min-h-9 sm:min-w-9",
    on ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink",
  );

export function FitModule({
  report,
  assets,
}: {
  report: FitReport;
  assets: { motion: Motion; url: string }[];
}) {
  const options = report.sizeOptions.filter((o) => o.regions.length);
  const [size, setSize] = useState(report.recommendedSize ?? options[0]?.size);
  const [motion, setMotion] = useState<Motion>(assets[0]?.motion ?? "WALK");
  const [heat, setHeat] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [show3d, setShow3d] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const viewerBox = useRef<HTMLDivElement>(null);

  // Load three.js only when the viewer scrolls into view.
  useEffect(() => {
    const el = viewerBox.current;
    if (!el || !assets.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow3d(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [assets.length]);

  const onError = useCallback(() => setState("failed"), []);
  const onReady = useCallback(() => setState("ready"), []);

  const current = options.find((o) => o.size === size) ?? options[0];
  if (!current) return null;
  const tensions = Array<number>(7).fill(0);
  const unsure = Array<number>(7).fill(0);
  for (const r of current.regions) {
    tensions[REGION_ID[r.region]] = shownTension(r);
    unsure[REGION_ID[r.region]] = r.uncertain ? 1 : 0;
  }
  const asset = assets.find((a) => a.motion === motion) ?? assets[0];
  const viewer = asset && state !== "failed";

  return (
    <div className={cx("grid gap-4", viewer && "md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]")}>
      {viewer && (
        <div className="flex min-w-0 flex-col gap-2">
          <div
            ref={viewerBox}
            className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted"
          >
            {state === "loading" && (
              <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden />
            )}
            {show3d && (
              <Suspense fallback={null}>
                <FitViewer
                  key={asset.url}
                  url={asset.url}
                  tensions={tensions}
                  unsure={unsure}
                  heat={heat}
                  playing={playing}
                  speed={speed}
                  onError={onError}
                  onReady={onReady}
                />
              </Suspense>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Motion">
            {MOTIONS.filter((m) => assets.some((a) => a.motion === m.id)).map((m) => (
              <button
                key={m.id}
                type="button"
                className={chip(m.id === motion)}
                aria-pressed={m.id === motion}
                onClick={() => {
                  setState("loading");
                  setMotion(m.id);
                }}
              >
                {m.label}
              </button>
            ))}
            <button
              type="button"
              className={chip(false)}
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <button
              type="button"
              className={chip(false)}
              onClick={() => setSpeed((s) => (s === 1 ? 0.5 : s === 0.5 ? 2 : 1))}
              aria-label="Speed"
            >
              {speed}×
            </button>
            <label className="ml-auto inline-flex min-h-11 items-center gap-2 text-sm sm:min-h-9">
              <input
                type="checkbox"
                checked={heat}
                onChange={(e) => setHeat(e.target.checked)}
                className="size-4"
              />
              Heatmap
            </label>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm text-subtle">Recommended</p>
          <p className="text-sm text-subtle">
            Confidence {CONFIDENCE[report.confidence].toLowerCase()}
          </p>
        </div>
        <p className="-mt-2 text-2xl font-bold" data-testid="fit-recommended">
          {report.recommendedSize}
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Size">
          {options.map((o) => (
            <button
              key={o.size}
              type="button"
              className={chip(o.size === current.size)}
              aria-pressed={o.size === current.size}
              onClick={() => setSize(o.size)}
            >
              {o.size}
            </button>
          ))}
        </div>
        <ul className="flex flex-col gap-2" data-testid="fit-regions">
          {current.regions.map((r) => (
            <li key={r.region} className="flex items-center gap-3 text-sm">
              <span
                className={cx(
                  "size-4 shrink-0 rounded-full",
                  r.uncertain && "ring-2 ring-line ring-offset-1",
                )}
                style={{ background: heatCss(shownTension(r), r.uncertain) }}
                aria-hidden
              />
              <span className="w-20 shrink-0 font-medium">{REGION_LABEL[r.region]}</span>
              <span className="text-subtle">
                {r.uncertain
                  ? `${VERDICT[bandOf(r.tensionLow)]}–${VERDICT[bandOf(r.tensionHigh)].toLowerCase()}`
                  : VERDICT[r.verdict]}
              </span>
            </li>
          ))}
        </ul>
        {current.notes.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {current.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        <div>
          <div className="h-2 rounded-full" style={{ background: RAMP_CSS }} aria-hidden />
          <div className="mt-1 flex justify-between text-xs text-subtle">
            <span>Comfortable</span>
            <span>Tight</span>
          </div>
        </div>
        <p className="text-xs text-subtle">Guidance, not a guarantee</p>
      </div>
    </div>
  );
}
