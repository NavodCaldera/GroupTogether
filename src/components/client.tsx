"use client";

import { useEffect, useState } from "react";

/** Live "2h 5m left" that ticks every 20s; the server renders the first value. */
export function Countdown({ until, prefix = "" }: { until: string; prefix?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return <span>{prefix}time is up</span>;
  const mins = Math.ceil(ms / 60_000);
  const h = Math.floor(mins / 60);
  return (
    <span suppressHydrationWarning>
      {prefix}
      {h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`} left
    </span>
  );
}

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this link", url);
        }
      }}
      className="inline-flex min-h-11 items-center sm:min-h-10 justify-center rounded-lg border border-line px-4 text-sm font-medium hover:bg-muted"
    >
      {copied ? "Link copied" : "Copy link"}
    </button>
  );
}

type Sales = { total: string; updatedAt: string };

/** Total sales in LKR. The server renders the first value; it refreshes every 15s while visible. */
export function SalesCounter({ initial }: { initial: Sales }) {
  const [s, setS] = useState(initial);
  useEffect(() => {
    const load = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/sales", { cache: "no-store" });
        if (r.ok) setS(await r.json());
      } catch {}
    };
    const t = setInterval(load, 15_000);
    document.addEventListener("visibilitychange", load);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);
  return (
    <>
      <p className="text-sm font-semibold text-accent">Total Sale</p>
      <p className="mt-2 text-5xl font-bold tabular-nums tracking-tight sm:text-7xl">{s.total}</p>
    </>
  );
}
