import type { Metadata } from "next";
import Link from "next/link";
import { ProgressBar, StatusBadge } from "@/components/cart-bits";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { myCarts } from "@/server/carts/queries";

export const metadata: Metadata = { title: "My carts" };

export default async function MyCartsPage() {
  const user = await requireUser([], "/my-carts");
  const carts = await myCarts(user.id);
  return (
    <>
      <PageHeader title="My carts" />
      {carts.length === 0 ? (
        <EmptyState title="You're not in any carts yet">
          <Link href="/carts" className="font-medium text-accent underline">
            Join an open cart
          </Link>{" "}
          or{" "}
          <Link href="/carts/new" className="font-medium text-accent underline">
            start one
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {carts.map((c) => (
            <Link
              key={c.id}
              href={`/c/${c.code}`}
              className="flex flex-col gap-3 rounded-xl border border-line p-4 hover:border-accent"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">
                  {c.name || c.code}
                  {c.ownerId === user.id && <span className="ml-2 text-xs text-accent">Owner</span>}
                </p>
                <StatusBadge status={c.status} />
              </div>
              <ProgressBar total={c.total} min={c.minOrderValue} />
              <p className="text-xs text-subtle">{c._count.members} members</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
