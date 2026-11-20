"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Replays the home hero animation `plays` times in all: every `cycleMs` the children fade out and
 * are remounted, which restarts their CSS animations and the price counter. Remounting would drop
 * focus and pull a link from under the pointer, so it waits while the hero is hovered or holds
 * focus. Reduced motion never replays. No pause button (owner, 2026-11-21).
 */
export function HeroReplay({
  children,
  cycleMs,
  plays,
}: {
  children: ReactNode;
  cycleMs: number;
  plays: number;
}) {
  const [run, setRun] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const held = hovered || focused;
  useEffect(() => {
    if (held || run >= plays - 1) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const out = setTimeout(() => setLeaving(true), cycleMs - 300);
    const next = setTimeout(() => {
      setLeaving(false);
      setRun((r) => r + 1);
    }, cycleMs);
    return () => {
      clearTimeout(out);
      clearTimeout(next);
      setLeaving(false);
    };
  }, [run, held, plays, cycleMs]);
  return (
    <div
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
    >
      <div key={run} className={leaving ? "fc-leave" : run > 0 ? "fc-enter" : undefined}>
        {children}
      </div>
    </div>
  );
}
