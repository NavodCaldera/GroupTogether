import type { Metadata } from "next";
import Link from "next/link";
import { ProductImage } from "@/components/cart-bits";
import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { TaxonomyFields } from "@/components/taxonomy-fields";
import { formatLKR } from "@/lib/format";
import { findKind, isAudience, kindFits } from "@/lib/taxonomy";
import { type ProductFilters, listProducts, shopFacets } from "@/server/catalogue";

export const metadata: Metadata = { title: "Shop" };

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const sp = await searchParams;
  const cart = one(sp.cart);
  const filters: ProductFilters = {
    audience: isAudience(one(sp.audience)) ? (one(sp.audience) as "MEN") : undefined,
    kind: findKind(one(sp.kind)) ? one(sp.kind) : undefined,
    stockType:
      one(sp.type) === "B_GRADE" || one(sp.type) === "FACTORY_SURPLUS"
        ? (one(sp.type) as "B_GRADE")
        : undefined,
    brand: one(sp.brand),
    size: one(sp.size),
    q: one(sp.q),
  };
  if (filters.audience && filters.kind && !kindFits(filters.audience, filters.kind))
    filters.kind = undefined;
  const [products, facets] = await Promise.all([listProducts(filters), shopFacets()]);
  // 16px text on phones so iOS doesn't zoom into the field.
  const select =
    "min-h-11 min-w-0 rounded-lg border border-line bg-paper px-2 text-base sm:min-h-10 sm:text-sm";

  return (
    <>
      <PageHeader title="Shop" />
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
      <form className="mb-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" action="/shop">
        {cart && <input type="hidden" name="cart" value={cart} />}
        <input
          name="q"
          type="search"
          defaultValue={filters.q}
          placeholder="Search"
          aria-label="Search"
          className={`${select} col-span-2 px-3 sm:min-w-40 sm:flex-1`}
        />
        <TaxonomyFields
          audience={filters.audience}
          kind={filters.kind}
          size={filters.size}
          allSizes={facets.sizes}
          withSize
          selectClass={select}
        />
        <button className="col-span-2 min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent sm:min-h-10">
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
                <p className="mt-2 text-xs text-subtle">{p.brand}</p>
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
