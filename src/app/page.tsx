import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { ProductImage } from "@/components/cart-bits";
import { formatLKR } from "@/lib/format";
import { SalesCounter } from "@/components/client";
import { listProducts, retailSaving, salesSnapshot } from "@/server/catalogue";
import { sweep } from "@/server/carts/service";
import { getSettings } from "@/server/settings";

export default async function HomePage() {
  // The home page is for shoppers; admins go straight to the back office, packing staff to
  // their packing list.
  const role = (await getCurrentUser())?.role;
  if (role === "ADMIN") redirect("/admin");
  if (role === "SELLER") redirect("/seller");
  await sweep();
  const [products, settings, sales, saving] = await Promise.all([
    listProducts({}, 8, "cheapest"),
    getSettings(),
    salesSnapshot(),
    retailSaving(),
  ]);
  return (
    <div className="flex flex-col gap-12">
      <section className="rounded-2xl bg-muted px-5 py-8 sm:px-10 sm:py-10">
        <SalesCounter initial={sales} />
      </section>

      <section>
        <h1 className="mb-4 text-xl font-semibold">Buy clothing from partner factories together</h1>
        <ol className="grid gap-4 sm:grid-cols-4">
          {[
            "Start or join a cart",
            "Add your items",
            `Reach ${formatLKR(settings.minOrderValue)}`,
            "Owner pays, PickMe delivers",
          ].map((t, i) => (
            <li key={t} className="rounded-xl border border-line p-4">
              <span className="text-sm font-bold text-accent">{i + 1}</span>
              <p className="mt-1 font-semibold">{t}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Clothing from partner factories</h2>
        <WhyCheap saving={saving} />
      </section>

      {products.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-xl font-semibold">Affordable prices</h2>
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

/** Why prices are low: factory bulk buying feeds group carts. Pure markup, no client JS. */
function WhyCheap({ saving }: { saving: number | null }) {
  const icon = "mt-0.5 h-6 w-6 shrink-0 text-accent sm:h-8 sm:w-8";
  const box = "flex flex-1 gap-3 rounded-xl border border-line bg-paper p-3 sm:p-4";
  return (
    <div className="rounded-2xl bg-muted p-3 sm:p-6">
      <div className="flex flex-col items-stretch gap-1 md:flex-row md:items-center md:gap-4">
        <div className={box}>
          <svg
            className={icon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M3 21V10l5 3V10l5 3V10l5 3V4h3v17H3z" />
            <path d="M7 17h2M11 17h2M15 17h2" />
          </svg>
          <div>
            <p className="font-semibold">Direct from partner factories</p>
            <p className="mt-1 text-sm text-subtle">
              Clothing comes directly from our partner factories.
            </p>
          </div>
        </div>

        <span
          className="self-center text-xl leading-none font-bold text-accent md:text-2xl"
          aria-hidden
        >
          <span className="md:hidden">↓</span>
          <span className="hidden md:inline">→</span>
        </span>

        <div className={box}>
          <svg
            className={icon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="9" cy="8" r="3" />
            <circle cx="17" cy="9" r="2.5" />
            <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c.6-.3 1.3-.5 2-.5 2.5 0 4.5 2 4.5 4.5" />
          </svg>
          <div>
            <p className="font-semibold">Consumer group buying</p>
            <p className="mt-1 text-sm text-subtle">
              Share a cart to reach the minimum. The owner pays once.
            </p>
          </div>
        </div>
      </div>

      <p className="mt-3 text-center font-semibold text-accent sm:mt-4">
        <span
          className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-accent align-middle"
          aria-hidden
        />
        {saving !== null ? `On average ${saving}% below retail.` : "Lower prices for you."} No
        middlemen, no small-order costs.
      </p>
    </div>
  );
}
