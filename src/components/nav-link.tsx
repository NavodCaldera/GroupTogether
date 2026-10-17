"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

/** Is `path` inside the section at `href` (or one of its extra prefixes)? */
export function inSection(path: string, href: string, also: string[] = []) {
  if (href === "/") return path === "/";
  return (
    path === href || path.startsWith(`${href}/`) || also.some((prefix) => path.startsWith(prefix))
  );
}

/** A header link that marks the page you are on: `aria-current` plus `activeClassName`. */
export function NavLink({
  href,
  also,
  className = "",
  activeClassName = "",
  ...props
}: ComponentProps<typeof Link> & { href: string; also?: string[]; activeClassName?: string }) {
  const active = inSection(usePathname(), href, also);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${className} ${active ? activeClassName : ""}`}
      {...props}
    />
  );
}
