import Link from "next/link";
import { signOutAction } from "@/server/auth/actions";
import { getCurrentUser } from "@/server/auth/session";
import { unreadCount } from "@/server/notify";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const unread = user ? await unreadCount(user.id) : 0;
  const link = "rounded-md px-2.5 py-1.5 hover:bg-muted";
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-1 gap-y-2 px-4 py-3 text-sm">
        <Link href="/" className="mr-3 text-lg font-bold tracking-tight">
          Group<span className="text-accent">Together</span>
        </Link>
        <Link href="/shop" className={link}>
          Shop
        </Link>
        <Link href="/carts" className={link}>
          Open carts
        </Link>
        {user && (
          <Link href="/my-carts" className={link}>
            My carts
          </Link>
        )}
        {user?.role === "ADMIN" && (
          <Link href="/admin" className={link}>
            Admin
          </Link>
        )}
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
              className="rounded-lg bg-accent px-3 py-1.5 font-medium text-on-accent hover:opacity-90"
            >
              Join free
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
