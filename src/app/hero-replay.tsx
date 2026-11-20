"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Replays the home hero animation: every `cycleMs` the children fade out and are remounted, which
 * restarts their CSS animations and the price counter. Pause stops the loop (WCAG 2.2.2); reduced
 * motion never loops and hides the button.
 */
export function HeroReplay({ children, cycleMs }: { children: ReactNode; cycleMs: number }) {
  const [run, setRun] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const out = setTimeout(() => setLeaving(true), cycleMs - 300);
    const next = setTimeout(() => {
      setLeaving(false);
      setRun((r) => r + 1);
    }, cycleMs);
    return () => {
      clearTimeout(out);
      clearTimeout(next);
    };
  }, [run, paused, cycleMs]);
  return (
    <>
      <div key={run} className={leaving ? "fc-leave" : run > 0 ? "fc-enter" : undefined}>
        {children}
      </div>
      <button
        type="button"
        onClick={() => {
          setPaused((p) => !p);
          setLeaving(false);
        }}
        aria-label={paused ? "Play animation" : "Pause animation"}
        className="absolute top-2 right-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-subtle hover:text-ink motion-reduce:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
          {paused ? <path d="M8 5v14l11-7z" /> : <path d="M7 5h4v14H7zM13 5h4v14h-4z" />}
        </svg>
      </button>
    </>
  );
}
