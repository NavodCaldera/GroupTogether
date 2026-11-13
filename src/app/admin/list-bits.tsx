import Link from "next/link";
import type { ReactNode } from "react";
import { SuggestInput } from "@/components/suggest-input";
import { Button, Input, cx } from "@/components/ui";

/** Server-rendered pieces shared by the admin lists. Filters and search are plain GET links. */

type Params = Record<string, string | string[] | undefined>;

/** One query-string value (the first, if repeated). */
export function param(sp: Params, key: string): string | undefined {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || undefined;
}

/** Page number from `?page=`, at least 1. */
export function pageNumber(sp: Params): number {
  const n = Number(param(sp, "page"));
  return Number.isInteger(n) && n > 1 ? n : 1;
}

/** `base` with these query values; undefined or empty values are dropped. */
export function hrefWith(base: string, values: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

export function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs sm:min-h-7",
        active ? "border-accent bg-accent text-on-accent" : "border-line hover:bg-muted",
      )}
    >
      {children}
    </Link>
  );
}

export function ChipRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mb-4 flex flex-wrap gap-2", className)}>{children}</div>;
}

/** GET search box. `keep` carries the active filters into the search. */
export function SearchForm({
  action,
  q,
  placeholder,
  label = placeholder,
  keep = {},
  suggest,
}: {
  action: string;
  q?: string;
  placeholder: string;
  /** Screen-reader label, when the placeholder is shortened to fit a phone. */
  label?: string;
  keep?: Record<string, string | undefined>;
  /** Route answering `?q=` with suggestions to show while typing. */
  suggest?: string;
}) {
  return (
    <form action={action} className="mb-4 flex gap-2" role="search">
      {Object.entries(keep).map(
        ([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />,
      )}
      {suggest ? (
        <SuggestInput
          endpoint={suggest}
          defaultValue={q}
          placeholder={placeholder}
          label={label}
          className="min-w-0 flex-1"
          inputClassName="outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
        />
      ) : (
        <Input
          name="q"
          type="search"
          defaultValue={q}
          placeholder={placeholder}
          aria-label={label}
          className="min-w-0 flex-1"
        />
      )}
      <Button type="submit" variant="secondary">
        Search
      </Button>
    </form>
  );
}

/** Previous / next links. Lists fetch one row more than a page to know if there is a next. */
export function Pager({
  page,
  hasNext,
  href,
}: {
  page: number;
  hasNext: boolean;
  href: (page: number) => string;
}) {
  if (page === 1 && !hasNext) return null;
  const link =
    "inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm hover:bg-muted sm:min-h-9";
  return (
    <nav className="mt-4 flex items-center justify-between gap-2 text-sm" aria-label="Pages">
      {page > 1 ? (
        <Link href={href(page - 1)} className={link}>
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-subtle">Page {page}</span>
      {hasNext ? (
        <Link href={href(page + 1)} className={link}>
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/** Scrollable table shell with the admin header style. */
export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-sm whitespace-nowrap">
        <thead className="bg-muted text-left text-xs text-subtle">
          <tr className="[&>th]:px-3 [&>th]:py-2">{head}</tr>
        </thead>
        <tbody className="divide-y divide-line [&_td]:px-3 [&_td]:py-2">{children}</tbody>
      </table>
    </div>
  );
}

/** A count badge for the nav and chips. */
export function Count({ n, tone = "muted" }: { n: number; tone?: "muted" | "alert" }) {
  if (n === 0) return null;
  return (
    <span
      className={cx(
        "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-5 font-semibold",
        tone === "alert" ? "bg-danger text-paper" : "bg-muted text-ink",
      )}
    >
      {n}
    </span>
  );
}

/** Label/value pairs, label left and value right. */
function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="flex flex-col gap-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3">
          <dt className="text-subtle">{label}</dt>
          <dd className="text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
