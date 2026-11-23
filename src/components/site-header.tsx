import Link from "next/link";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/server/auth/session";
import { currentTheme } from "@/server/theme";
import { toggleThemeAction } from "@/server/theme-actions";
import { NavLink } from "./nav-link";

const SECTIONS = [
  { href: "/", label: "Home", icon: <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" /> },
  { href: "/baskets", label: "Baskets", icon: <path d="M3 9h18l-2 11H5zM8 9l4-6 4 6" /> },
  {
    href: "/reselling",
    label: "Reselling",
    icon: <path d="M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4" />,
  },
  {
    href: "/tokens",
    label: "Tokens",
    icon: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9h6M9 15h6M12 7v10" />,
  },
];

function Icon({ size = 20, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-ink"
    >
      {children}
    </svg>
  );
}

/** Phones: logo and account on top, sections in a bottom tab bar. From `sm` up the sections
 * move into the top bar. No client JavaScript. */
export async function SiteHeader() {
  const [user, theme] = await Promise.all([getCurrentUser(), currentTheme()]);
  const tap = "min-h-11 items-center rounded-md px-2 hover:bg-muted sm:min-h-9 sm:px-2.5";
  const link = `inline-flex ${tap}`;
  const underline =
    "relative text-ink after:absolute after:inset-x-2 sm:after:inset-x-2.5 after:-bottom-[7px] after:h-0.5 after:rounded-full after:bg-accent sm:after:-bottom-[11px]";
  const dark = theme === "dark";
  // Buyers get the section tabs; a company login has only its dashboard, behind the logo.
  const company = !!user?.companyId;
  const sections = user && !company ? SECTIONS : [];

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-1.5 text-sm sm:py-2.5">
          <Link
            href={company ? "/company" : "/"}
            className="mr-1 text-base font-bold tracking-tight sm:mr-3 sm:text-lg"
          >
            Group<span className="text-accent">Basket</span>
          </Link>
          {sections.slice(1).map((s) => (
            <NavLink
              key={s.href}
              href={s.href}
              className={`hidden sm:inline-flex ${tap}`}
              activeClassName={`${underline} font-medium`}
            >
              {s.label}
            </NavLink>
          ))}
          <span className="flex-1" />
          <form action={toggleThemeAction}>
            <button
              type="submit"
              className={`${link} cursor-pointer`}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              title={dark ? "Light mode" : "Dark mode"}
            >
              <Icon>
                {dark ? (
                  <>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                  </>
                ) : (
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                )}
              </Icon>
            </button>
          </form>
          {user ? (
            <NavLink
              href="/account"
              className={link}
              activeClassName={underline}
              aria-label="Profile"
              title="Profile"
            >
              <Icon size={22}>
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="10" r="3" />
                <path d="M6.2 18.8a7 7 0 0 1 11.6 0" />
              </Icon>
            </NavLink>
          ) : (
            <>
              <Link href="/sign-in" className={link}>
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="inline-flex min-h-10 items-center rounded-lg bg-accent px-3 font-medium text-on-accent hover:opacity-90 sm:min-h-9"
              >
                Join free
              </Link>
            </>
          )}
        </nav>
      </header>

      {sections.length > 0 && (
        <nav
          aria-label="Sections"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
        >
          <ul className="flex">
            {sections.map((s) => (
              <li key={s.href} className="flex-1">
                <NavLink
                  href={s.href}
                  className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-subtle active:bg-muted"
                  activeClassName="!text-accent"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="size-5 fill-none stroke-current stroke-[1.8] [stroke-linecap:round] [stroke-linejoin:round]"
                  >
                    {s.icon}
                  </svg>
                  {s.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}
