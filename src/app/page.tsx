import Link from "next/link";
import { ProductImage } from "@/components/cart-bits";
import { formatLKR } from "@/lib/format";
import { SalesCounter } from "@/components/client";
import { listProducts, salesSnapshot } from "@/server/catalogue";
import { sweep } from "@/server/carts/service";
import { getSettings } from "@/server/settings";

export default async function HomePage() {
  await sweep();
  const [products, settings, sales] = await Promise.all([
    listProducts({}, 8),
    getSettings(),
    salesSnapshot(),
  ]);
  return (
    <div className="flex flex-col gap-12">
      <section className="rounded-2xl bg-muted px-5 py-8 sm:px-10 sm:py-10">
        <SalesCounter initial={sales} />
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
              "Everyone is notified in the app when the cart hits the minimum.",
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
                <p className="mt-2 line-clamp-1 text-sm font-medium group-hover:underline">
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
