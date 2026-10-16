import Link from "next/link";
import { CartCard, ProductImage, StockTypeBadge } from "@/components/cart-bits";
import { EmptyState } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { listProducts } from "@/server/catalogue";
import { recentCarts } from "@/server/carts/queries";
import { sweep } from "@/server/carts/service";
import { getSettings } from "@/server/settings";

export default async function HomePage() {
  await sweep();
  const [carts, products, settings] = await Promise.all([
    recentCarts(6),
    listProducts({}, 8),
    getSettings(),
  ]);
  return (
    <div className="flex flex-col gap-12">
      <section className="rounded-2xl bg-muted px-6 py-10 sm:px-10">
        <p className="text-sm font-semibold text-accent">Factory surplus · B-grade · Bulk prices</p>
        <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
          Buy shoes and clothes at bulk prices, together.
        </h1>
        <p className="mt-3 max-w-xl text-subtle">
          Every order needs at least{" "}
          <strong className="text-ink">{formatLKR(settings.minOrderValue)}</strong>. Start a shared
          cart, invite friends or let anyone join, and reach it together.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/carts"
            className="rounded-lg bg-accent px-5 py-2.5 font-medium text-on-accent hover:opacity-90"
          >
            Join an open cart
          </Link>
          <Link
            href="/carts/new"
            className="rounded-lg border border-line bg-paper px-5 py-2.5 font-medium hover:bg-muted"
          >
            Start a cart
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-xl font-semibold">Recent carts. Join one!</h2>
          <Link href="/carts" className="text-sm font-medium text-accent">
            See all →
          </Link>
        </div>
        {carts.length === 0 ? (
          <EmptyState title="No open carts right now">
            <Link href="/carts/new" className="font-medium text-accent underline">
              Start the first one
            </Link>
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {carts.map((c) => (
              <CartCard key={c.id} cart={c} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">How it works</h2>
        <ol className="grid gap-4 sm:grid-cols-4">
          {[
            [
              "Start or join a cart",
              "Pick a public cart, follow a friend's link, or start your own.",
            ],
            ["Add your items", "Your items are held for you as soon as they're in the cart."],
            [
              `Reach ${formatLKR(settings.minOrderValue)}`,
              "Everyone gets an email when the cart hits the minimum.",
            ],
            [
              "Owner pays, PickMe delivers",
              `The owner pays by bank transfer within ${settings.slipWindowHours} hours and gets one PickMe drop. They pay the driver the delivery fee.`,
            ],
          ].map(([t, d], i) => (
            <li key={t} className="rounded-xl border border-line p-4">
              <span className="text-sm font-bold text-accent">{i + 1}</span>
              <p className="mt-1 font-semibold">{t}</p>
              <p className="mt-1 text-sm text-subtle">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {products.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-xl font-semibold">New in</h2>
            <Link href="/shop" className="text-sm font-medium text-accent">
              Shop all →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {products.map((p) => (
              <Link key={p.id} href={`/products/${p.id}`} className="group">
                <ProductImage {...p} />
                <div className="mt-2 flex items-center gap-2">
                  <StockTypeBadge stockType={p.stockType} />
                </div>
                <p className="mt-1 line-clamp-1 text-sm font-medium group-hover:underline">
                  {p.title}
                </p>
                <p className="text-sm font-semibold">{formatLKR(p.price)}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
