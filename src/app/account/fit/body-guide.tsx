"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { REGIONS, type Region } from "@/lib/fit/regions";

/** Where each measurement goes on a front-view figure (viewBox 0 0 200 400). */
const MARK: Record<Region, React.ReactNode> = {
  shoulder: (
    <>
      <path d="M64 80H136" />
      <path d="M64 73v14M136 73v14" />
    </>
  ),
  chest: <ellipse cx="100" cy="112" rx="38" ry="6" />,
  waist: <ellipse cx="100" cy="166" rx="33" ry="5.5" />,
  hip: <ellipse cx="100" cy="204" rx="41" ry="6.5" />,
  upperArm: <ellipse cx="57" cy="118" rx="12" ry="4" transform="rotate(-12 57 118)" />,
  thigh: <ellipse cx="122" cy="242" rx="17" ry="5" />,
  torso: (
    <>
      <path d="M154 80V206" />
      <path d="M147 80h14M147 206h14" />
    </>
  ),
};

/**
 * A figure that shows where a measurement is taken: the focused field's region, or each region
 * in turn while none is focused (still when the viewer prefers reduced motion).
 */
export function BodyGuide({
  active,
  label,
}: {
  active: Region | null;
  label: (r: Region) => string;
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
  return (
    <figure className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 200 400" className="h-44 w-auto sm:h-72" aria-hidden="true">
        <g
          className="fill-subtle stroke-subtle opacity-20"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="100" cy="40" r="19" stroke="none" />
          <rect x="92" y="56" width="16" height="18" rx="4" stroke="none" />
          <path
            d="M64 76Q100 68 136 76L139 140Q132 172 141 210L59 210Q68 172 61 140Z"
            strokeWidth="2"
          />
          <path d="M64 82L52 150L46 210M136 82L148 150L154 210" fill="none" strokeWidth="17" />
          <path d="M80 208L78 300L77 384M120 208L122 300L123 384" fill="none" strokeWidth="27" />
        </g>
        {REGIONS.map((r) => (
          <g
            key={r}
            fill="none"
            strokeLinecap="round"
            className={cx(
              "transition-all duration-300",
              shown === r
                ? "body-guide-on stroke-accent"
                : cx("stroke-subtle", shown ? "opacity-0" : "opacity-40"),
            )}
            strokeWidth={shown === r ? 3.5 : 2}
            strokeDasharray={shown === r ? undefined : "4 4"}
          >
            {MARK[r]}
          </g>
        ))}
      </svg>
      <figcaption className="min-h-5 text-sm font-medium text-accent">
        {shown ? label(shown) : ""}
      </figcaption>
    </figure>
  );
}
