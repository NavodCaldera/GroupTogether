"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

/** A header link that marks the section you are in: `aria-current` plus `activeClassName`. */
export function NavLink({
  href,
  className = "",
  activeClassName = "",
  ...props
}: ComponentProps<typeof Link> & { href: string; activeClassName?: string }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${className} ${active ? activeClassName : ""}`}
      {...props}
    />
  );
}
