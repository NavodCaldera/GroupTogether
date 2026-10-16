import Link from "next/link";
import { adminBadges } from "@/server/admin-queries";
import { requireAdmin } from "@/server/auth/session";
import { Count } from "./list-bits";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  const badges = await adminBadges();
  const link =
    "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-3 hover:bg-muted sm:min-h-9";
  const items: [string, string, number][] = [
    ["/admin", "Overview", 0],
    ["/admin/slips", "Bank slips", badges.slips],
    ["/admin/carts", "Carts", 0],
    ["/admin/deliveries", "Deliveries", badges.toBook],
    ["/admin/products", "Products", 0],
    ["/admin/users", "Users", 0],
    ["/admin/settings", "Settings", 0],
  ];
  return (
    <div className="flex flex-col gap-6">
      {/* One swipeable row on phones instead of wrapping onto several lines. */}
      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 pb-2 text-sm whitespace-nowrap sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-3">
        {items.map(([href, label, n]) => (
          <Link key={href} href={href} className={link}>
            {label}
            <Count n={n} tone="alert" />
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
