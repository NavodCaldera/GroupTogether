"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import GUIDE from "@/lib/fit/body-guide.json";
import { REGIONS, type Region } from "@/lib/fit/regions";

/**
 * A rendered standard body (tools/body-guide) that shows where a measurement is taken: rings are
 * the body's real cross-sections, solid in front and faint behind. It shows the focused field's
 * region, or each region in turn while none is focused (all at once, still, under reduced
 * motion). The women's body is shown for a "Women" fit, the men's otherwise.
 */
export function BodyGuide({
  active,
  label,
  fit,
}: {
  active: Region | null;
  label: (r: Region) => string;
  fit: string;
}) {
  // -1: not cycling (before start, or reduced motion), so every mark shows faintly.
  const [tick, setTick] = useState(-1);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const step = () => setTick((n) => n + 1);
    const first = setTimeout(step, 400);
    const every = setInterval(step, 1800);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
  const shown = active ?? (tick < 0 ? null : REGIONS[tick % REGIONS.length]);
  const body = fit === "WOMEN" ? "women" : "men";
  const g = GUIDE[body];
  return (
    <figure className="flex flex-col items-center gap-1">
      <div className="relative h-72 sm:h-96" style={{ aspectRatio: `${g.width} / ${g.height}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a 23 KB pre-sized render */}
        <img
          src={`/fit-assets/guide/${body}.webp`}
          alt=""
          width={g.width}
          height={g.height}
          className="absolute inset-0 size-full select-none"
          draggable={false}
        />
        <svg
          viewBox={`0 0 ${g.width} ${g.height}`}
          className="absolute inset-0 size-full"
          aria-hidden="true"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {REGIONS.map((r) => {
            const m = g.marks[r];
            const on = shown === r;
            return (
              <g
                key={`${body}-${r}-${on}`}
                className={cx(
                  "transition-opacity duration-300",
                  on ? "stroke-accent" : cx("stroke-accent", shown ? "opacity-0" : "opacity-50"),
                )}
              >
                {m.back && (
                  <path d={m.back} strokeWidth={on ? 4 : 3} strokeDasharray="8 8" opacity={0.45} />
                )}
                <path
                  d={m.front}
                  strokeWidth={on ? 7 : 4}
                  pathLength={1}
                  className={on ? "body-guide-on" : undefined}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="min-h-5 text-sm font-medium text-accent">
        {shown ? label(shown) : ""}
      </figcaption>
    </figure>
  );
}
