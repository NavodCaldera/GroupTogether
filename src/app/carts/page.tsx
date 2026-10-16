import type { Metadata } from "next";
import Link from "next/link";
import { CartCard } from "@/components/cart-bits";
import { EmptyState, PageHeader } from "@/components/ui";
import { recentCarts } from "@/server/carts/queries";
import { sweep } from "@/server/carts/service";

export const metadata: Metadata = { title: "Open carts" };

export default async function CartsPage() {
  await sweep();
  const carts = await recentCarts(60);
  return (
    <>
      <PageHeader
        title="Open carts"
        description="Public carts still taking members. Join one and add your items to help it reach the minimum."
        actions={
          <Link
            href="/carts/new"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90"
          >
            Start a cart
          </Link>
        }
      />
      {carts.length === 0 ? (
        <EmptyState title="No open carts right now">Start one and share the link.</EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {carts.map((c) => (
            <CartCard key={c.id} cart={c} />
          ))}
        </div>
      )}
    </>
  );
}
