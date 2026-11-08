import { Atkinson_Hyperlegible } from "next/font/google";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/ui";
import type { FactoryRole } from "@/generated/prisma/client";
import type { sizeGrid } from "@/lib/factory-insights";
import { type FactorySection, canFactory } from "@/lib/factory-roles";

/**
 * The factory area's look (product owner, 2026-11-03): a cutting ticket, like the job dockets on a
 * garment floor. Atkinson Hyperlegible was drawn for low-vision readers, so sizes and counts stay
 * clear at arm's length on a phone. The app's own colours: green good, amber warning, red bad.
 */
const legible = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"] });

const TABS: { key: FactorySection; href: Route; label: string; icon: ReactNode }[] = [
  {
    key: "returns",
    href: "/seller/returns",
    label: "Returns",
    icon: <path d="M9 4 4 9l5 5M4 9h11a5 5 0 0 1 0 10h-3" />,
  },
  {
    key: "home",
    href: "/seller",
    label: "Home",
    icon: <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" />,
  },
  {
    key: "orders",
    href: "/seller/orders",
    label: "Orders",
    icon: <path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10" />,
  },
  {
    key: "baskets",
    href: "/seller/baskets",
    label: "Baskets",
    icon: <path d="M3 9h18l-2 11H5zM8 9l4-6 4 6" />,
  },
  {
    key: "products",
    href: "/seller/products",
    label: "Products",
    icon: <path d="M8 3 4 6v4h3v11h10V10h3V6l-4-3a4 4 0 0 1-8 0z" />,
  },
  {
    key: "insights",
    href: "/seller/insights",
    label: "Ratings",
    icon: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z" />,
  },
  {
    key: "team",
    href: "/seller/team",
    label: "Team",
    icon: (
      <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7M18 14a7 7 0 0 1 4 7" />
    ),
  },
];

/**
 * The page frame for a factory login: its typeface, a title and the sections its job may open
 * (2026-11-04). On a phone the sections are a bottom tab bar in thumb reach; from `sm` up they
 * sit under the title.
 */
export function FactoryShell({
  active,
  role,
  title,
  action,
  children,
}: {
  active: FactorySection;
  role: FactoryRole;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const tabs = TABS.filter((t) => canFactory(role, t.key));
  return (
    <div className={cx(legible.className, "mx-auto w-full max-w-2xl text-base leading-normal")}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h1 className="text-[1.75rem] leading-tight font-bold break-words">{title}</h1>
        {action}
      </div>
      <nav
        aria-label="Factory"
        className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-ink bg-paper pb-[env(safe-area-inset-bottom)] sm:static sm:z-auto sm:mb-5 sm:border-t-0 sm:border-b-2 sm:pb-0"
      >
        <ul className="flex">
          {tabs.map((t) => (
            <li key={t.key} className="flex-1">
              <Link
                href={t.href}
                aria-current={t.key === active ? "page" : undefined}
                className={cx(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 border-t-4 px-1 text-xs sm:-mb-0.5 sm:min-h-12 sm:border-t-0 sm:border-b-4 sm:text-sm",
                  t.key === active ? "border-accent font-bold" : "border-transparent text-subtle",
                )}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="size-5 fill-none stroke-current stroke-[1.8] [stroke-linecap:round] [stroke-linejoin:round] sm:hidden"
                >
                  {t.icon}
                </svg>
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
      <div aria-hidden className="h-20 sm:hidden" />
    </div>
  );
}

/**
 * A ticket: a thick ink frame, an optional heading strip, and a dashed tear line above its foot.
 * `tone` marks the frame for work waiting (accent) or a problem (danger).
 */
export function Ticket({
  head,
  foot,
  tone = "ink",
  children,
  className,
}: {
  head?: ReactNode;
  foot?: ReactNode;
  tone?: "ink" | "accent" | "danger";
  children: ReactNode;
  className?: string;
}) {
  const frame = { ink: "border-ink", accent: "border-accent", danger: "border-danger" }[tone];
  return (
    <section className={cx("rounded-md border-2 bg-paper", frame, className)}>
      {head && (
        <div
          className={cx(
            "flex items-baseline justify-between gap-2 px-3 pt-2.5 pb-2",
            tone === "accent" && "bg-accent text-on-accent",
          )}
        >
          {head}
        </div>
      )}
      <div className="px-3 py-2.5">{children}</div>
      {foot && <div className="border-t-2 border-dashed border-line px-3 py-2.5">{foot}</div>}
    </section>
  );
}

/** Sizes across, products down, pieces in each cell: read like a cutting ticket. */
export function SizeGrid({ grid }: { grid: ReturnType<typeof sizeGrid> }) {
  const one = grid.rows.length === 1;
  return (
    <div
      role="region"
      aria-label="Pieces by size"
      tabIndex={0}
      className="-mx-3 overflow-x-auto px-3 focus-visible:outline-2 focus-visible:outline-ink"
    >
      {one && <p className="mb-1 text-sm">{grid.rows[0].label}</p>}
      <table className="w-full border-collapse text-center tabular-nums">
        <caption className="sr-only">Pieces to pack by size</caption>
        <thead>
          <tr className="text-sm">
            {!one && (
              <th scope="col" className="pr-2 text-left font-normal text-subtle">
                Item
              </th>
            )}
            {grid.sizes.map((s) => (
              <th key={s} scope="col" className="min-w-11 px-1 pb-1 font-bold">
                {s}
              </th>
            ))}
            <th scope="col" className="min-w-11 pl-2 pb-1 text-right font-normal text-subtle">
              Pcs
            </th>
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((r) => (
            <tr key={r.label} className="border-t border-line">
              {!one && (
                <th scope="row" className="py-1.5 pr-2 text-left text-sm font-normal">
                  {r.label}
                </th>
              )}
              {grid.sizes.map((s) => (
                <td
                  key={s}
                  className={cx(
                    "px-1 py-1.5 text-[1.75rem] leading-none font-bold",
                    !r.cells[s] && "text-xl font-normal text-subtle",
                  )}
                >
                  {r.cells[s] ?? "–"}
                </td>
              ))}
              <td className="py-1.5 pl-2 text-right text-xl">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A plain figure: the number large, its label small underneath. */
export function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xl leading-tight font-bold whitespace-nowrap tabular-nums">{value}</p>
      <p className="text-sm text-subtle">{label}</p>
    </div>
  );
}

/**
 * A tape measure for one month's pieces: the filled length is the share of the best month, with
 * a tick every tenth so lengths compare at a glance. The number sits beside it.
 */
export function Tape({ share }: { share: number }) {
  return (
    <span
      aria-hidden
      className="block h-4 rounded-sm border border-line bg-[repeating-linear-gradient(90deg,transparent_0,transparent_calc(10%-1px),var(--line)_calc(10%-1px),var(--line)_10%)]"
    >
      <span
        className="block h-full rounded-sm bg-accent"
        style={{ width: `${Math.max(share > 0 ? 2 : 0, share * 100)}%` }}
      />
    </span>
  );
}

/** Good, warning or bad: the only colours the factory area uses. */
export const TONE_BORDER = {
  good: "border-l-accent",
  warn: "border-l-warn",
  bad: "border-l-danger",
} as const;

/** A table that may scroll sideways on a phone; keyboard users can focus and scroll it too. */
export function ScrollTable({
  label,
  head,
  children,
}: {
  label: string;
  head: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-ink"
    >
      <table className="w-full text-sm whitespace-nowrap tabular-nums">
        <thead className="border-b-2 border-ink text-left">
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** "1 pc", "12 pcs". */
export const pcs = (n: number) => `${n.toLocaleString("en-LK")} ${n === 1 ? "pc" : "pcs"}`;
