import Link from "next/link";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/server/auth/session";
import { NavLink } from "./nav-link";
import { unreadCount } from "@/server/notify";
import { currentTheme } from "@/server/theme";
import { toggleThemeAction } from "@/server/theme-actions";

/** Roles with one section (Admin or My products), which the logo opens. They don't shop. */
const STAFF_HOME: Record<string, string> = {
  ADMIN: "/admin",
  SELLER: "/seller",
};

/**
 * The phone tab bar is for shoppers. Admins and factory sellers have one section,
 * which the logo already opens, so they get no tab bar.
 */
export function hasTabBar(user: { role: string } | null) {
  return !(user && user.role in STAFF_HOME);
}

/**
 * Mobile first: on phones the top bar holds only the logo, the bell and the account button,
 * and the main sections sit in a bottom tab bar within thumb reach. From `sm` up the sections
 * move into the top bar and the tab bar is hidden. No client JavaScript.
 */
export async function SiteHeader() {
  const [user, theme] = await Promise.all([getCurrentUser(), currentTheme()]);
  const inbox = !!user;
  const unread = user ? await unreadCount(user.id) : 0;
  const tap = "min-h-11 items-center rounded-md px-2.5 hover:bg-muted sm:min-h-9";
  const link = `inline-flex ${tap}`;
  const underline =
    "relative text-ink after:absolute after:inset-x-2.5 after:-bottom-[7px] after:h-0.5 after:rounded-full after:bg-accent sm:after:-bottom-[11px]";
  const sections: { href: string; label: string; icon: ReactNode; also?: string[] }[] = [
    // Admins and factory logins have no buyer home, shop, orders or tokens tabs.
    ...(user && user.role in STAFF_HOME
      ? []
      : [
          { href: "/", label: "Home", icon: <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" /> },
          {
            href: "/shop",
            label: "Shop",
            also: ["/products/"],
            icon: <path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2" />,
          },
          {
            href: "/orders",
            label: "Orders",
            also: ["/cart", "/checkout"],
            icon: <path d="M3 4h2l2.4 11h11L21 7H6.2M9 20h.01M18 20h.01" />,
          },
          {
            href: "/tokens",
            label: "Tokens",
            icon: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9h6M9 15h6M12 7v10" />,
          },
        ]),
    // Each role's own home: agents Agent, sellers their products, admins Admin.
    ...(user?.role === "AGENT"
      ? [
          {
            href: "/agent",
            label: "Agent",
            icon: <path d="M3 21V10l9-6 9 6v11h-6v-6H9v6zM9 10h6" />,
          },
        ]
      : []),
    ...(user?.role === "SELLER"
      ? [
          {
            href: "/seller",
            label: "My products",
            icon: <path d="M3 21V9l6-4v4l6-4v4l6-4v16zM7 17h2M11 17h2M15 17h2" />,
          },
        ]
      : []),
    ...(user?.role === "ADMIN"
      ? [
          {
            href: "/admin",
            label: "Admin",
            icon: <path d="M4 6h16M4 12h16M4 18h10" />,
          },
        ]
      : []),
  ];

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-1.5 text-sm sm:py-2.5">
          <Link
            href={(user && STAFF_HOME[user.role]) ?? "/"}
            className="mr-3 text-lg font-bold tracking-tight"
          >
            Group<span className="text-accent">Basket</span>
          </Link>
          {sections.slice(1).map((s) => (
            <NavLink
              key={s.href}
              href={s.href}
              also={s.also}
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
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="text-ink"
              >
                {theme === "dark" ? (
                  <>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                  </>
                ) : (
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                )}
              </svg>
            </button>
          </form>
          {user ? (
            <>
              {inbox && (
                <>
                  <NavLink
                    href="/notifications"
                    className={link}
                    activeClassName={underline}
                    aria-label={`Notifications, ${unread} unread`}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="text-ink"
                    >
                      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                    </svg>
                    {unread > 0 && (
                      <span className="ml-1 rounded-full bg-accent px-1.5 text-xs font-semibold text-on-accent">
                        {unread}
                      </span>
                    )}
                  </NavLink>
                </>
              )}
              <NavLink
                href="/account"
                className={link}
                activeClassName={underline}
                aria-label="Profile"
                title="Profile"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="text-ink"
                >
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="10" r="3" />
                  <path d="M6.2 18.8a7 7 0 0 1 11.6 0" />
                </svg>
              </NavLink>
            </>
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

      {hasTabBar(user) && (
        <nav
          aria-label="Sections"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
        >
          <ul className="flex">
            {sections.map((s) => (
              <li key={s.href} className="flex-1">
                <NavLink
                  href={s.href}
                  also={s.also}
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
