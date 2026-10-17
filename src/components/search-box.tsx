"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { formatLKR } from "@/lib/format";

type Hit = { id: string; title: string; brand: string; price: string };

/**
 * The shop search field with a dropdown of matching products. It is still a normal `q` input in
 * a GET form, so pressing Enter without choosing a suggestion searches as before.
 */
export function SearchBox({
  defaultValue,
  cart,
  className,
}: {
  defaultValue?: string;
  cart?: string;
  className?: string;
}) {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState(defaultValue ?? "");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [typed, setTyped] = useState(false);

  useEffect(() => {
    if (!typed || q.trim().length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(q.trim())}`, {
          signal: ctl.signal,
        });
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
  }, [q, typed]);

  const shown = open && typed && q.trim().length >= 2 ? hits : [];
  const go = (h: Hit) => router.push(`/products/${h.id}${cart ? `?cart=${cart}` : ""}`);

  return (
    <div className={`relative ${className ?? ""}`}>
      <input
        name="q"
        type="search"
        value={q}
        autoComplete="off"
        placeholder="Search"
        aria-label="Search"
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
        className="min-h-11 w-full min-w-0 rounded-lg border border-line bg-paper px-3 text-base sm:min-h-10 sm:text-sm"
      />
      {shown.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-paper py-1 shadow-lg"
        >
          {shown.map((h, i) => (
            <li
              key={h.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(h);
              }}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-sm ${i === active ? "bg-muted" : "hover:bg-muted"}`}
            >
              <span className="min-w-0 truncate">
                <span className="font-medium">{h.title}</span>
                <span className="text-subtle"> · {h.brand}</span>
              </span>
              <span className="shrink-0 font-semibold">{formatLKR(h.price)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
