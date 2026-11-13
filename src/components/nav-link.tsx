"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

/** Is `path` inside the section at `href` (or one of its extra prefixes)? */
function inSection(path: string, href: string, also: string[] = []) {
  if (href === "/") return path === "/";
  return (
    path === href || path.startsWith(`${href}/`) || also.some((prefix) => path.startsWith(prefix))
  );
}

/**
 * A header link that marks the page you are on: `aria-current` plus `activeClassName`.
 * `exact` marks it only on `href` itself (for a section's overview, e.g. `/admin`).
 */
export function NavLink({
  href,
  also,
  exact = false,
  className = "",
  activeClassName = "",
  ...props
}: ComponentProps<typeof Link> & {
  href: string;
  also?: string[];
  exact?: boolean;
  activeClassName?: string;
}) {
  const path = usePathname();
  const active = exact ? path === href : inSection(path, href, also);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${className} ${active ? activeClassName : ""}`}
      {...props}
    />
  );
}
