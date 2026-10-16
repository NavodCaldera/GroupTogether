import Link from "next/link";
import { requireSeller } from "@/server/auth/session";
import { db } from "@/server/db";

export default async function SellerLayout({ children }: LayoutProps<"/seller">) {
  const seller = await requireSeller();
  const { company } = await db.user.findUniqueOrThrow({
    where: { id: seller.id },
    select: { company: true },
  });
  const link =
    "inline-flex min-h-11 shrink-0 items-center rounded-md px-3 hover:bg-muted sm:min-h-9";
  return (
    <div className="flex flex-col gap-6">
      <div className="-mx-4 flex items-center gap-1 overflow-x-auto border-b border-line px-4 pb-2 text-sm whitespace-nowrap sm:mx-0 sm:px-0 sm:pb-3">
        <span className="mr-2 font-semibold">{company || seller.name}</span>
        <Link href="/seller" className={link}>
          My products
        </Link>
        <Link href="/seller/products/new" className={link}>
          Add product
        </Link>
      </div>
      {children}
    </div>
  );
}
