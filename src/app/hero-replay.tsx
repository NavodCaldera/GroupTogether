"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Replays the home hero animation: every `cycleMs` the children fade out and are remounted, which
 * restarts their CSS animations and the price counter. Reduced motion never loops. The owner
 * removed the pause button (2026-11-21).
 */
export function HeroReplay({ children, cycleMs }: { children: ReactNode; cycleMs: number }) {
  const [run, setRun] = useState(0);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const out = setTimeout(() => setLeaving(true), cycleMs - 300);
    const next = setTimeout(() => {
      setLeaving(false);
      setRun((r) => r + 1);
    }, cycleMs);
    return () => {
      clearTimeout(out);
      clearTimeout(next);
    };
  }, [run, cycleMs]);
  return (
    <div key={run} className={leaving ? "fc-leave" : run > 0 ? "fc-enter" : undefined}>
      {children}
    </div>
  );
}
