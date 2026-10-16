import Link from "next/link";
import { requireAdmin } from "@/server/auth/session";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  const link = "rounded-md px-3 py-1.5 hover:bg-muted";
  return (
    <div className="flex flex-col gap-6">
      <nav className="flex flex-wrap gap-1 border-b border-line pb-3 text-sm">
        <Link href="/admin" className={link}>
          Overview
        </Link>
        <Link href="/admin/slips" className={link}>
          Bank slips
        </Link>
        <Link href="/admin/carts" className={link}>
          Carts
        </Link>
        <Link href="/admin/products" className={link}>
          Products
        </Link>
        <Link href="/admin/settings" className={link}>
          Settings
        </Link>
      </nav>
      {children}
    </div>
  );
}
