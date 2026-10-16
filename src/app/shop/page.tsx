import type { Metadata } from "next";
import Link from "next/link";
import { ProductImage, StockTypeBadge } from "@/components/cart-bits";
import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { type ProductFilters, listProducts, shopFacets } from "@/server/catalogue";

export const metadata: Metadata = { title: "Shop" };

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const sp = await searchParams;
  const cart = one(sp.cart);
  const filters: ProductFilters = {
    category:
      one(sp.category) === "SHOES" || one(sp.category) === "APPAREL"
        ? (one(sp.category) as "SHOES")
        : undefined,
    stockType:
      one(sp.type) === "B_GRADE" || one(sp.type) === "FACTORY_SURPLUS"
        ? (one(sp.type) as "B_GRADE")
        : undefined,
    brand: one(sp.brand),
    size: one(sp.size),
    q: one(sp.q),
  };
  const [products, facets] = await Promise.all([listProducts(filters), shopFacets()]);
  const select = "min-h-10 rounded-lg border border-line bg-paper px-2 text-sm";

  return (
    <>
      <PageHeader title="Shop" description="Factory surplus and B-grade stock at bulk prices." />
      {cart && (
        <div className="mb-4">
          <Alert tone="info">
            Adding to cart <strong>{cart}</strong>. Pick an item, then its size.{" "}
            <Link href={`/c/${cart}`} className="font-medium underline">
              Back to the cart
            </Link>
          </Alert>
        </div>
      )}
      {/* A plain GET form: filtering needs no JavaScript. */}
      <form className="mb-6 flex flex-wrap gap-2" action="/shop">
        {cart && <input type="hidden" name="cart" value={cart} />}
        <input
          name="q"
          defaultValue={filters.q}
          placeholder="Search"
          className={`${select} min-w-40 flex-1 px-3`}
        />
        <select name="category" defaultValue={filters.category ?? ""} className={select}>
          <option value="">Shoes & apparel</option>
          <option value="SHOES">Shoes</option>
          <option value="APPAREL">Apparel</option>
        </select>
        <select name="type" defaultValue={filters.stockType ?? ""} className={select}>
          <option value="">All stock</option>
          <option value="FACTORY_SURPLUS">Factory surplus</option>
          <option value="B_GRADE">B-grade</option>
        </select>
        <select name="brand" defaultValue={filters.brand ?? ""} className={select}>
          <option value="">Any brand</option>
          {facets.brands.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <select name="size" defaultValue={filters.size ?? ""} className={select}>
          <option value="">Any size</option>
          {facets.sizes.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button className="min-h-10 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent">
          Filter
        </button>
      </form>

      {products.length === 0 ? (
        <EmptyState title="Nothing matches those filters" />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => {
            const inStock = p.variants.some((v) => v.available > 0);
            return (
              <Link
                key={p.id}
                href={`/products/${p.id}${cart ? `?cart=${cart}` : ""}`}
                className="group"
              >
                <ProductImage {...p} className={inStock ? "" : "opacity-50"} />
                <div className="mt-2">
                  <StockTypeBadge stockType={p.stockType} />
                </div>
                <p className="mt-1 text-xs text-subtle">{p.brand}</p>
                <p className="line-clamp-2 text-sm font-medium group-hover:underline">{p.title}</p>
                <p className="mt-0.5 text-sm">
                  <strong>{formatLKR(p.price)}</strong>
                  {p.retailPrice && (
                    <span className="ml-1.5 text-xs text-subtle line-through">
                      {formatLKR(p.retailPrice)}
                    </span>
                  )}
                </p>
                {!inStock && <p className="text-xs font-medium text-danger">Sold out</p>}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
