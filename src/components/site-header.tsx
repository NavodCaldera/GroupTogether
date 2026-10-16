import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/server/auth/actions";
import { getCurrentUser } from "@/server/auth/session";
import { unreadCount } from "@/server/notify";

/**
 * Mobile first: on phones the top bar holds only the logo, the bell and the account button,
 * and the main sections sit in a bottom tab bar within thumb reach. From `sm` up the sections
 * move into the top bar and the tab bar is hidden. No client JavaScript.
 */
export async function SiteHeader() {
  const user = await getCurrentUser();
  const unread = user ? await unreadCount(user.id) : 0;
  const tap = "min-h-11 items-center rounded-md px-2.5 hover:bg-muted sm:min-h-9";
  const link = `inline-flex ${tap}`;
  const sections: { href: string; label: string; icon: ReactNode }[] = [
    { href: "/", label: "Home", icon: <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" /> },
    {
      href: "/shop",
      label: "Shop",
      icon: <path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2" />,
    },
    {
      href: "/carts",
      label: "Open carts",
      icon: <path d="M3 4h2l2.4 11h11L21 7H6.2M9 20h.01M18 20h.01" />,
    },
    ...(user
      ? [
          {
            href: "/my-carts",
            label: "My carts",
            icon: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0" />,
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
          <Link href="/" className="mr-3 text-lg font-bold tracking-tight">
            Group<span className="text-accent">Together</span>
          </Link>
          {sections.slice(1).map((s) => (
            <Link key={s.href} href={s.href} className={`hidden sm:inline-flex ${tap}`}>
              {s.label}
            </Link>
          ))}
          <span className="flex-1" />
          {user ? (
            <>
              <Link
                href="/notifications"
                className={link}
                aria-label={`Notifications, ${unread} unread`}
              >
                🔔
                {unread > 0 && (
                  <span className="ml-1 rounded-full bg-accent px-1.5 text-xs font-semibold text-on-accent">
                    {unread}
                  </span>
                )}
              </Link>
              <form action={signOutAction}>
                <button className={link}>Sign out</button>
              </form>
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

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      >
        <ul className="flex">
          {sections.map((s) => (
            <li key={s.href} className="flex-1">
              <Link
                href={s.href}
                className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-subtle active:bg-muted"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="size-5 fill-none stroke-current stroke-[1.8] [stroke-linecap:round] [stroke-linejoin:round]"
                >
                  {s.icon}
                </svg>
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
