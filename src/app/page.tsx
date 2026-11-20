import type React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { isBuyerRole } from "@/lib/roles";
import { BuyerHome } from "./buyer-home";
import { ProductImage } from "@/components/cart-bits";
import { formatLKR } from "@/lib/format";
import { listProducts } from "@/server/catalogue";
import { savingPercent } from "@/lib/price-rules";
import { PriceDrop } from "./price-drop";
import { HeroReplay } from "./hero-replay";

export default async function HomePage() {
  // The home page is for shoppers; admins go straight to the back office, packing staff to
  // their packing list.
  const user = await getCurrentUser();
  const role = user?.role;
  if (role === "ADMIN") redirect("/admin");
  if (role === "SELLER") redirect("/seller");
  if (user && isBuyerRole(user.role)) return <BuyerHome user={user} />;
  const products = await listProducts({}, 8, "saving");
  const top = products[0];
  const topOff = top ? savingPercent(top.price, top.retailPrice) : null;
  const deal =
    top?.retailPrice && topOff !== null
      ? { price: top.price, retailPrice: top.retailPrice, off: topOff }
      : null;
  return (
    <div className="flex flex-col gap-12">
      <FactoryHero deal={deal} />

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

// Each middleman turns to dust: a COLS x ROWS grid of tiny clipped copies of the chip. Each piece
// drifts off to the right on a fixed pseudo-random path, left columns first.
const COLS = 12;
const ROWS = 4;
const rand = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
const pct = (n: number) => `${+n.toFixed(2)}%`;
const PIECES = Array.from({ length: COLS * ROWS }, (_, i) => {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const w = 100 / COLS;
  const h = 100 / ROWS;
  return {
    clip: `inset(${pct(row * h)} ${pct(100 - (col + 1) * w)} ${pct(100 - (row + 1) * h)} ${pct(col * w)})`,
    x: Math.round(14 + rand(i) * 46),
    y: Math.round(-34 + rand(i + 101) * 40),
    r: Math.round(-200 + rand(i + 7) * 400),
    delay: +(col * 0.03 + rand(i + 3) * 0.08).toFixed(3),
  };
});
const MIDDLEMEN = [
  { name: "Importer", at: 0.5, spread: 1, turn: 1 },
  { name: "Wholesaler", at: 1.1, spread: 1.25, turn: -1 },
  { name: "Shop", at: 1.7, spread: 0.9, turn: 1 },
];
/** When the last middleman is gone and the price starts to drop, and how long it takes. */
const DROP_AT_MS = 2900;
const DROP_MS = 800;
/** The whole story takes about 4 s; hold the end state, then play it again. */
const CYCLE_MS = 6500;

type Deal = { price: { toString(): string }; retailPrice: { toString(): string }; off: number };

/**
 * Factory straight to the buyer: the middlemen turn to dust one by one, then the top deal's price
 * counts down from retail to ours. CSS animation (globals.css, `fc-*`); reduced motion shows
 * the end state.
 */
function FactoryHero({ deal }: { deal: Deal | null }) {
  const chip = "rounded-full px-3 py-1 text-sm font-semibold";
  const arrow = "self-center text-lg leading-none font-bold text-accent";
  const middleman = `${chip} border border-line bg-paper text-subtle`;
  return (
    <section className="relative rounded-2xl bg-muted px-4 py-8 text-center sm:px-8 sm:py-12">
      <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-4xl">
        Direct from factory to you. <span className="text-accent">No more middlemen.</span>
      </h1>
      <p className="sr-only">Factory to you, with no importer, wholesaler or shop in between.</p>
      <HeroReplay cycleMs={CYCLE_MS}>
        <div
          className="fc mt-8 flex flex-col items-center gap-1.5 sm:flex-row sm:justify-center sm:gap-2"
          aria-hidden
        >
          <span className={`${chip} bg-accent text-on-accent`}>Factory</span>
          {MIDDLEMEN.map((m) => (
            <span
              key={m.name}
              className="fc-mm"
              style={{ "--d": `${m.at}s`, "--s": m.spread, "--t": m.turn } as React.CSSProperties}
            >
              <Arrow className={`fc-arrow ${arrow}`} />
              <span className="fc-chip relative inline-flex rounded-full">
                <span className={`fc-whole ${middleman}`}>{m.name}</span>
                {PIECES.map((p) => (
                  <span
                    key={p.clip}
                    className={`fc-piece absolute inset-0 flex items-center justify-center ${middleman}`}
                    style={
                      {
                        clipPath: p.clip,
                        "--x": `${p.x}px`,
                        "--y": `${p.y}px`,
                        "--r": `${p.r}deg`,
                        "--pd": `${p.delay}s`,
                      } as React.CSSProperties
                    }
                  >
                    {m.name}
                  </span>
                ))}
              </span>
            </span>
          ))}
          <Arrow className={`fc-link ${arrow}`} />
          <span className={`${chip} bg-accent text-on-accent`}>You</span>
        </div>
        {deal && (
          <p className="fc-price mt-6 flex flex-wrap items-center justify-center gap-x-2 text-2xl font-bold">
            <PriceDrop
              from={deal.retailPrice.toString()}
              to={deal.price.toString()}
              startMs={DROP_AT_MS}
              durationMs={DROP_MS}
            />
            <span className="fc-after text-base font-medium text-subtle line-through decoration-danger decoration-2">
              {formatLKR(deal.retailPrice)}
            </span>
            <span className="fc-after rounded-md bg-accent px-1.5 py-0.5 text-sm text-on-accent">
              −{deal.off}%
            </span>
          </p>
        )}
      </HeroReplay>
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
