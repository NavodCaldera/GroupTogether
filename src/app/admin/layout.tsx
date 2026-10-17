import { NavLink } from "@/components/nav-link";
import { adminBadges } from "@/server/admin-queries";
import { requireAdmin } from "@/server/auth/session";
import { Count } from "./list-bits";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  const badges = await adminBadges();
  const link =
    "relative inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-3 hover:bg-muted sm:min-h-9";
  // The open page gets a green bar just under its label (inside the tab, so the scrollable row
  // never overflows vertically and shows a scrollbar).
  const active =
    "font-medium text-ink after:absolute after:inset-x-3 after:bottom-1.5 after:h-0.5 after:rounded-full after:bg-accent sm:after:bottom-1";
  const items: [string, string, number][] = [
    ["/admin", "Overview", 0],
    ["/admin/slips", "Bank slips", badges.slips],
    ["/admin/carts", "Carts", 0],
    ["/admin/deliveries", "Deliveries", badges.toBook],
    ["/admin/products", "Products", badges.inReview],
    ["/admin/users", "Users", 0],
    ["/admin/settings", "Settings", 0],
  ];
  return (
    <div className="flex flex-col gap-6">
      {/* One swipeable row on phones instead of wrapping onto several lines. */}
      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-4 pb-2 text-sm whitespace-nowrap sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-3">
        {items.map(([href, label, n]) => (
          <NavLink
            key={href}
            href={href}
            exact={href === "/admin"}
            className={link}
            activeClassName={active}
          >
            {label}
            <Count n={n} tone="alert" />
          </NavLink>
        ))}
      </nav>
      {children}
    </div>
  );
}
