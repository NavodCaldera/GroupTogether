import { NavLink } from "@/components/nav-link";
import type { OperationalAdminArea } from "@/lib/admin-access";
import { adminBadges } from "@/server/admin-queries";
import { requireAnyAdmin } from "@/server/auth/session";
import { Count } from "./list-bits";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAnyAdmin();
  const badges = await adminBadges(admin.id, admin.adminArea);
  const link =
    "relative inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-3 hover:bg-muted sm:min-h-9";
  // The open page gets a green bar just under its label (inside the tab, so the scrollable row
  // never overflows vertically and shows a scrollbar).
  const active =
    "font-medium text-ink after:absolute after:inset-x-3 after:bottom-1.5 after:h-0.5 after:rounded-full after:bg-accent sm:after:bottom-1";
  // Each admin works in one area (ADMIN-001/002) and sees only that area's tabs.
  // Red counts: work waiting; grey: low stock.
  const tabs: Record<OperationalAdminArea, [string, string, number, ("alert" | "muted")?][]> = {
    PREMIUM: [
      ["/admin/brands", "Brand rewards", badges.brandRewards],
      ["/admin/users", "Users", 0],
    ],
    FACTORY: [
      ["/admin/factory", "Factory apparel", 0],
      ["/admin", "Stock", 0],
      ["/admin/lots", "Lots", 0],
      ["/admin/products", "Products", badges.lowStock, "muted"],
      ["/admin/offers", "Offers", badges.offers],
      ["/admin/users", "Users", 0],
      ["/admin/settings", "Settings", 0],
    ],
    WAREHOUSE: [
      ["/admin/warehouse", "Warehouse & delivery", 0],
      ["/admin/slips", "Slips", badges.slips],
      ["/admin/orders", "Orders", badges.orders],
      ["/admin/carts", "Carts", 0],
      ["/admin/users", "Users", 0],
      ["/admin/settings", "Settings", 0],
    ],
  };
  const visible = tabs[admin.adminArea];
  return (
    <div className="flex flex-col gap-6">
      {/* One swipeable row on phones instead of wrapping onto several lines. */}
      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-4 pb-2 text-sm whitespace-nowrap sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-3">
        {visible.map(([href, label, n, tone = "alert"]) => (
          <NavLink
            key={href}
            href={href}
            exact={href === "/admin"}
            className={link}
            activeClassName={active}
          >
            {label}
            <Count n={n} tone={tone} />
          </NavLink>
        ))}
      </nav>
      {children}
    </div>
  );
}
