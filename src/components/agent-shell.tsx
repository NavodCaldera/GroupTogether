import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, cx } from "@/components/ui";

type AgentSection = "home" | "pickups" | "returns" | "tokens" | "hours";

const TABS: { key: AgentSection; href: Route; label: string }[] = [
  { key: "home", href: "/agent", label: "Home" },
  { key: "pickups", href: "/agent/pickups", label: "Pickups" },
  { key: "returns", href: "/agent/returns", label: "Returns" },
  { key: "tokens", href: "/agent/tokens", label: "Tokens" },
  { key: "hours", href: "/agent/hours", label: "Hours" },
];

/**
 * The page frame for an agent's working screens: a title and the agent sections as a tab row
 * under it. The row stays in the page (not fixed) so it never covers the shopper tab bar an agent
 * also has on a phone.
 */
export function AgentShell({
  active,
  title,
  badge,
  children,
}: {
  active: AgentSection;
  title: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {badge}
      </div>
      <nav aria-label="Agent" className="-mt-1 border-b border-line">
        <ul className="flex">
          {TABS.map((t) => (
            <li key={t.key} className="min-w-0 flex-1">
              <Link
                href={t.href}
                aria-current={t.key === active ? "page" : undefined}
                className={cx(
                  "-mb-px flex min-h-11 items-center justify-center border-b-2 px-1 text-sm",
                  t.key === active
                    ? "border-accent font-semibold text-ink"
                    : "border-transparent text-subtle hover:text-ink",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </div>
  );
}

/** A titled block of the agent home, with an optional count beside the heading. */
export function Section({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  const id = `s-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={id} className="text-lg font-semibold">
          {title}
          {count !== undefined && (
            <span className="ml-2 text-base font-normal text-subtle tabular-nums">{count}</span>
          )}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function AgentStatusBadge({ status }: { status: string }) {
  if (status === "SUSPENDED") return <Badge tone="bad">Suspended</Badge>;
  if (status === "LEAVING") return <Badge tone="info">Leaving</Badge>;
  return null;
}
