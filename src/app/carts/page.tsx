import type { Metadata } from "next";
import Link from "next/link";
import { CartCard } from "@/components/cart-bits";
import { EmptyState, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/server/auth/session";
import { recentCarts } from "@/server/carts/queries";
import { sweep } from "@/server/carts/service";

export const metadata: Metadata = { title: "Carts" };

export default async function CartsPage({ searchParams }: PageProps<"/carts">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  await sweep();
  const user = await getCurrentUser();
  const near =
    user && user.lat !== null && user.lng !== null ? { lat: user.lat, lng: user.lng } : null;
  const carts = await recentCarts(60, new Date(), user?.id, { q, near });
  return (
    <>
      <PageHeader title="Carts" />
      {/* A plain GET form: searching needs no JavaScript. */}
      <form action="/carts" className="mb-2 flex gap-2">
        <input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search carts by name"
          aria-label="Search carts by name"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 text-base sm:min-h-10 sm:text-sm"
        />
        <button className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent sm:min-h-10">
          Search
        </button>
        {q && (
          <Link
            href="/carts"
            className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-medium hover:bg-muted sm:min-h-10"
          >
            Clear
          </Link>
        )}
      </form>
      {!near && (
        <p className="mb-4 text-sm text-subtle">
          {user ? (
            <>
              Newest first.{" "}
              <Link href="/account" className="font-medium text-accent underline">
                Pin your location
              </Link>{" "}
              to see the nearest carts first.
            </>
          ) : (
            <>
              Newest first.{" "}
              <Link href="/sign-in?next=/carts" className="font-medium text-accent underline">
                Sign in
              </Link>{" "}
              to see the nearest carts first.
            </>
          )}
        </p>
      )}
      {carts.length === 0 ? (
        <EmptyState title={q ? `No carts match "${q}"` : "No carts right now"}>
          {q ? "Try another name, or start one yourself." : "Start one and share the link."}
        </EmptyState>
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
