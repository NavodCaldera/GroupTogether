import Link from "next/link";
import { cx } from "@/components/ui";

/** The factory area's sections (product owner, 2026-11-03): one tap row, phone first. */
export function FactoryNav({ active }: { active: "home" | "orders" | "products" | "insights" }) {
  const tabs = [
    ["home", "/seller", "Home"],
    ["orders", "/seller/orders", "Orders"],
    ["products", "/seller/products", "Products"],
    ["insights", "/seller/insights", "Ratings"],
  ] as const;
  return (
    <nav aria-label="Factory" className="mb-4 grid grid-cols-4 gap-1 text-sm">
      {tabs.map(([key, href, label]) => (
        <Link
          key={key}
          href={href}
          aria-current={key === active ? "page" : undefined}
          className={cx(
            "grid min-h-11 place-items-center rounded-lg border border-line px-1",
            key === active ? "bg-accent font-medium text-on-accent" : "hover:bg-muted",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** A plain number with its label: no chart. */
export function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line p-2.5">
      <p className="text-xs text-subtle">{label}</p>
      <p className="text-base font-semibold tabular-nums break-words">{value}</p>
    </div>
  );
}

/** Good, warning or bad: the only colours the factory area uses. */
export const TONE_BORDER = {
  good: "border-l-accent",
  warn: "border-l-warn",
  bad: "border-l-danger",
} as const;
