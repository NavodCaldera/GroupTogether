"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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

/** "← Back": the previous page when there is one in this tab, otherwise `fallback`. */
export function BackLink({ fallback }: { fallback: string }) {
  return (
    <Link
      href={fallback}
      onClick={(e) => {
        if (window.history.length > 1) {
          e.preventDefault();
          window.history.back();
        }
      }}
      className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-subtle hover:text-ink sm:min-h-10"
    >
      <span aria-hidden>←</span> Back
    </Link>
  );
}

/** Share icon that opens a small menu: copy the link, or share it on WhatsApp. */
export function ShareMenu({ url, whatsappUrl }: { url: string; whatsappUrl: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const item =
    "flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-muted sm:min-h-10";
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Share this cart"
        className="inline-flex size-11 items-center justify-center rounded-full border border-line text-subtle hover:bg-muted hover:text-ink sm:size-9"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-2 w-56 rounded-xl border border-line bg-paper p-1.5 shadow-lg">
          <button
            type="button"
            className={item}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => {
                  setCopied(false);
                  setOpen(false);
                }, 1200);
              } catch {
                window.prompt("Copy this link", url);
              }
            }}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
              <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
            </svg>
            {copied ? "Link copied" : "Copy link"}
          </button>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={item}
            onClick={() => setOpen(false)}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4 text-[#25D366]"
              fill="currentColor"
              aria-hidden
            >
              <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2s-1 .3-3.4-.7a11.6 11.6 0 0 1-4.6-4.1 5.2 5.2 0 0 1-1.1-2.8 3 3 0 0 1 1-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.2-.3.3-.1.6a8.6 8.6 0 0 0 1.6 2 7.8 7.8 0 0 0 2.3 1.4c.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3a2.4 2.4 0 0 1-.2 1.4Z" />
            </svg>
            Share on WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}
