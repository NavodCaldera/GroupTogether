"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "./ui";

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

/** Copies `url` to the clipboard; the label reads `copiedLabel` for 2s afterwards. */
export function CopyLinkButton({
  url,
  className,
  label = "Copy link",
  copiedLabel = "Link copied",
}: {
  url: string;
  className?: string;
  label?: string;
  copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          window.prompt(label, url);
          return;
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </Button>
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
      // Green text, not a filled button: Back is secondary and must not compete with the page's
      // main action. min-h-11 keeps a 44 px tap target; -ml-2 + px-2 lines the arrow up with the
      // page edge while keeping the hit area.
      className="-ml-2 mb-2 inline-flex w-fit self-start min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-accent underline-offset-4 transition hover:underline focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:outline-none sm:min-h-10"
    >
      <span aria-hidden>←</span> Back
    </Link>
  );
}
