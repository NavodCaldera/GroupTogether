"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { cx } from "./ui";

/** One row of the dropdown, shaped by the server route that answers `endpoint?q=`. */
export type Suggestion = { href: string; main: string; sub?: string; side?: string };

/**
 * A `q` search field that suggests matches while typing (from 2 characters, 200 ms after the last
 * key). Picking one opens it; pressing Enter without picking submits the surrounding GET form as
 * before. Used by the shop search and the admin carts search.
 */
export function SuggestInput({
  endpoint,
  defaultValue,
  placeholder,
  label,
  className,
  inputClassName,
}: {
  endpoint: string;
  defaultValue?: string;
  placeholder: string;
  label: string;
  className?: string;
  inputClassName?: string;
}) {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState(defaultValue ?? "");
  const [hits, setHits] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [typed, setTyped] = useState(false);

  useEffect(() => {
    if (!typed || q.trim().length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const url = new URL(endpoint, window.location.origin);
        url.searchParams.set("q", q.trim());
        const res = await fetch(url, { signal: ctl.signal });
        if (res.ok) {
          setHits(await res.json());
          setActive(-1);
        }
      } catch {}
    }, 200);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, typed, endpoint]);

  const shown = open && typed && q.trim().length >= 2 ? hits : [];
  const go = (h: Suggestion) => router.push(h.href);

  return (
    <div className={cx("relative", className)}>
      <input
        name="q"
        type="search"
        value={q}
        autoComplete="off"
        placeholder={placeholder}
        aria-label={label}
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(e) => {
          setQ(e.target.value);
          setTyped(true);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (shown.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % shown.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a <= 0 ? shown.length - 1 : a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            go(shown[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        className={cx(
          "min-h-11 w-full min-w-0 rounded-lg border border-line bg-paper px-3 text-base sm:min-h-10 sm:text-sm",
          inputClassName,
        )}
      />
      {shown.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-paper py-1 shadow-lg"
        >
          {shown.map((h, i) => (
            <li
              key={h.href}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(h);
              }}
              className={cx(
                "flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-sm",
                i === active ? "bg-muted" : "hover:bg-muted",
              )}
            >
              <span className="min-w-0 truncate">
                <span className="font-medium">{h.main}</span>
                {h.sub && <span className="text-subtle"> · {h.sub}</span>}
              </span>
              {h.side && <span className="shrink-0 font-semibold">{h.side}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
