"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Select } from "./ui";

type FilterCategory = { slug: string; name: string; companies: { slug: string; name: string }[] };

/** Category and company pickers; the company list shows only the chosen category's companies. */
export function BasketFilter({
  cats,
  category,
  company,
}: {
  cats: FilterCategory[];
  category: string;
  company: string;
}) {
  const [cat, setCat] = useState(category);
  const [co, setCo] = useState(company);
  const shown = cats.filter((c) => !cat || c.slug === cat).flatMap((c) => c.companies);
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        Category
        <Select
          name="category"
          value={cat}
          onChange={(e) => {
            const next = e.target.value;
            setCat(next);
            if (next && !cats.find((c) => c.slug === next)?.companies.some((x) => x.slug === co))
              setCo("");
          }}
        >
          <option value="">All</option>
          {cats.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Company
        <Select name="company" value={co} onChange={(e) => setCo(e.target.value)}>
          <option value="">All</option>
          {shown.map((x) => (
            <option key={x.slug} value={x.slug}>
              {x.name}
            </option>
          ))}
        </Select>
      </label>
    </>
  );
}

// How many GroupBasket pages sit behind this one in the tab's history, so Back never leaves the
// site for a page the visitor came from (a shared link, a search result). Kept in memory: a full
// reload starts again at 0, which only means Back uses its fallback.
let depth = 0;
let popped = false;
// Set when Back falls back with a replace: the page changes but the history does not grow.
let replaced = false;
let last: string | null = null;

/** Mounted once in the root layout: counts in-app moves (forward +1, browser back -1). */
export function NavDepth() {
  const pathname = usePathname();
  useEffect(() => {
    const onPop = () => {
      popped = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (last !== null && last !== pathname && !replaced)
      depth = popped ? Math.max(0, depth - 1) : depth + 1;
    popped = false;
    replaced = false;
    last = pathname;
  }, [pathname]);
  return null;
}

/**
 * "‹ Back": the previous GroupBasket page when there is one in this tab, otherwise `fallback`.
 * The fallback replaces this page in the history instead of adding one, so Back on the fallback
 * page cannot bounce straight back here (two pages whose fallbacks point at each other looped).
 */
export function BackLink({ fallback }: { fallback: string }) {
  const router = useRouter();
  return (
    <Link
      href={fallback}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        if (depth > 0) window.history.back();
        else {
          replaced = true;
          router.replace(fallback);
        }
      }}
      // Green text, not a filled button: Back is secondary and must not compete with the page's
      // main action. A drawn chevron (a text arrow sits off the baseline and splits the underline)
      // and a soft hover background like the header links. min-h-11 keeps a 44 px tap target;
      // -ml-2 lines the chevron up with the page edge while keeping the hit area.
      className="-ml-2 mb-2 inline-flex min-h-11 w-fit items-center gap-0.5 self-start rounded-lg pr-2.5 pl-1 text-sm font-medium text-accent transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:outline-none sm:min-h-10"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Back
    </Link>
  );
}
