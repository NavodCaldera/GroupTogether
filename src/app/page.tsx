import { Fragment } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { isBuyerRole } from "@/lib/roles";
import { BuyerHome } from "./buyer-home";
import { ProductImage } from "@/components/cart-bits";
import { formatLKR } from "@/lib/format";
import { listProducts, retailSaving } from "@/server/catalogue";
import { savingPercent } from "@/lib/price-rules";

export default async function HomePage() {
  // The home page is for shoppers; admins go straight to the back office, packing staff to
  // their packing list.
  const user = await getCurrentUser();
  const role = user?.role;
  if (role === "ADMIN") redirect("/admin");
  if (role === "SELLER") redirect("/seller");
  if (user && isBuyerRole(user.role)) return <BuyerHome user={user} />;
  const [products, saving] = await Promise.all([listProducts({}, 8, "saving"), retailSaving()]);
  return (
    <div className="flex flex-col gap-12">
      <FactoryHero saving={saving} />

      {products.length > 0 && (
        <section aria-labelledby="home-savings">
          <div className="mb-4 flex items-end justify-between">
            <h2 id="home-savings" className="text-xl font-semibold">
              Biggest savings
            </h2>
            <Link href="/shop" className="text-sm font-medium text-accent">
              Shop all →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {products.map((p) => {
              const off = savingPercent(p.price, p.retailPrice);
              return (
                <Link key={p.id} href={`/products/${p.id}`} className="group">
                  <div className="relative">
                    <ProductImage {...p} />
                    {off !== null && (
                      <span className="absolute top-2 left-2 rounded-md bg-accent px-1.5 py-0.5 text-xs font-bold text-on-accent">
                        −{off}%
                      </span>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-1 text-sm font-medium group-hover:underline">
                    {p.title}
                  </p>
                  <p className="text-sm">
                    <strong>{formatLKR(p.price)}</strong>
                    {off !== null && p.retailPrice && (
                      <span className="ml-1.5 text-xs text-subtle line-through">
                        {formatLKR(p.retailPrice)}
                      </span>
                    )}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/** Factory straight to the buyer, with the middle of the usual chain struck out. No client JS. */
function FactoryHero({ saving }: { saving: number | null }) {
  const chip = "rounded-full px-3 py-1 text-sm font-semibold";
  const arrow = "self-center text-lg leading-none font-bold text-accent";
  return (
    <section className="rounded-2xl bg-muted px-4 py-8 text-center sm:px-8 sm:py-12">
      <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-4xl">
        Direct from factory to you. <span className="text-accent">No more middlemen.</span>
      </h1>
      {saving !== null && (
        <p className="mt-6">
          <span className="block text-5xl font-extrabold text-accent sm:text-6xl">{saving}%</span>
          <span className="mt-1 block text-lg font-semibold">below retail</span>
        </p>
      )}
      <p className="mt-8 flex flex-col items-center gap-1.5 sm:flex-row sm:justify-center sm:gap-2">
        <span className={`${chip} bg-accent text-on-accent`}>Factory</span>
        {["Importer", "Wholesaler", "Shop"].map((m) => (
          <Fragment key={m}>
            <Arrow className={arrow} />
            <del
              className={`${chip} border border-line bg-paper text-subtle line-through decoration-danger decoration-2`}
            >
              {m}
            </del>
          </Fragment>
        ))}
        <Arrow className={arrow} />
        <span className={`${chip} bg-accent text-on-accent`}>You</span>
      </p>
      <Link
        href="/shop"
        className="mt-8 inline-flex min-h-11 items-center rounded-lg bg-accent px-6 font-semibold text-on-accent hover:opacity-90"
      >
        Shop now
      </Link>
    </section>
  );
}

function Arrow({ className }: { className: string }) {
  return (
    <span className={className} aria-hidden>
      <span className="sm:hidden">↓</span>
      <span className="hidden sm:inline">→</span>
    </span>
  );
}
