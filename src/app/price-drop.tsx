"use client";

import { useEffect, useRef } from "react";
import { formatLKR } from "@/lib/format";

/**
 * The hero's price: rendered at our price, then (motion allowed) shown at the retail price and
 * counted down to ours once the middlemen are gone. Writes the text directly; no re-renders.
 */
export function PriceDrop({
  from,
  to,
  startMs,
  durationMs,
}: {
  from: string;
  to: string;
  startMs: number;
  durationMs: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const a = Number(from);
    const b = Number(to);
    const started = performance.now();
    let frame = 0;
    el.textContent = formatLKR(from);
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - started - startMs) / durationMs));
      const eased = 1 - (1 - t) ** 3;
      el.textContent = t === 1 ? formatLKR(to) : formatLKR(Math.round(a + (b - a) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      el.textContent = formatLKR(to);
    };
  }, [from, to, startMs, durationMs]);
  return <span ref={ref}>{formatLKR(to)}</span>;
}
