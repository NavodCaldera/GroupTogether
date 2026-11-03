import type { Metadata } from "next";
import Link from "next/link";
import { ProductImage } from "@/components/cart-bits";
import { Badge, Button, EmptyState, PageHeader, cx } from "@/components/ui";
import { stockAlert } from "@/lib/factory-insights";
import { formatLKR } from "@/lib/format";
import { requireSeller } from "@/server/auth/session";
import { factoryProducts } from "@/server/factory-dashboard";
import { factorySizeStockAction, removeFactorySizeAction } from "@/server/seller-actions";
import { pcs } from "../design-chart";
import { FactoryNav } from "../factory-bits";

export const metadata: Metadata = { title: "Products" };

/**
 * The factory's listings (product owner, 2026-11-03): sold (paid) and sales per product, and per
 * size the stock left, pieces sold, and what is held in active carts, which is not a sale yet.
 * Stock changes inline, without client script. A listing shows in the shop only while it has
 * stock and isn't hidden by us.
 */
export default async function FactoryProductsPage() {
  const seller = await requireSeller();
  const products = await factoryProducts(seller.id);
  return (
    <>
      <PageHeader
        title="Products"
        actions={
          <Link
            href="/seller/new"
            className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-on-accent"
          >
            + Product
          </Link>
        }
      />
      <FactoryNav active="products" />
      {products.length === 0 ? (
        <EmptyState title="No products yet" />
      ) : (
        <ul className="flex flex-col gap-4">
          {products.map((p) => {
            const inStock = p.variants.some((v) => v.available > 0);
            return (
              <li
                key={p.id}
                id={`p-${p.id}`}
                className="scroll-mt-20 rounded-xl border border-line p-3"
              >
                <div className="flex gap-3">
                  <ProductImage {...p} className="w-20 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/seller/products/${p.id}`}
                        className="font-medium break-words underline-offset-2 hover:underline"
                      >
                        {p.title}
                      </Link>
                      {p.status === "ARCHIVED" ? (
                        <Badge tone="bad">Hidden by us</Badge>
                      ) : inStock ? (
                        <Badge tone="good">In shop</Badge>
                      ) : (
                        <Badge>No stock</Badge>
                      )}
                    </div>
                    <p className="text-sm tabular-nums">{formatLKR(p.price)}</p>
                    <p className="text-sm tabular-nums">
                      Sold (paid): {pcs(p.pieces)} · {formatLKR(p.value)}
                    </p>
                  </div>
                </div>

                <ul className="mt-3 flex flex-col gap-2">
                  {p.variants.map((v) => {
                    const alert = stockAlert(v.available);
                    const size = v.colour ? `${v.size} · ${v.colour}` : v.size;
                    return (
                      <li
                        key={v.id}
                        aria-label={`Size ${size}`}
                        className="rounded-lg bg-muted/50 p-2 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {size}
                            {p.bestSize === v.size && (
                              <span className="ml-1.5 inline-block">
                                <Badge tone="good">Best seller</Badge>
                              </span>
                            )}
                          </span>
                          <span
                            className={cx(
                              "font-semibold tabular-nums",
                              alert === "sold-out" && "text-danger",
                              alert === "low" && "text-warn",
                            )}
                          >
                            {alert === "sold-out" ? "Sold out" : `${v.available} left`}
                          </span>
                        </div>
                        <p className="text-xs text-subtle tabular-nums">
                          Sold (paid): {v.soldPaid} · Wanted in active carts: {v.reserved} (not
                          sales yet)
                        </p>
                        <form
                          action={factorySizeStockAction}
                          className="mt-1.5 grid grid-cols-[1fr_auto_auto] gap-1.5"
                        >
                          <input type="hidden" name="productId" value={p.id} />
                          <input type="hidden" name="size" value={v.size} />
                          <input type="hidden" name="colour" value={v.colour} />
                          <input
                            name="qty"
                            type="number"
                            min={1}
                            max={9999}
                            inputMode="numeric"
                            required
                            aria-label={`Pieces of ${size}`}
                            placeholder="Pieces"
                            className="min-h-11 min-w-0 rounded-lg border border-line bg-paper px-3 text-base"
                          />
                          <Button name="dir" value="add">
                            Add
                          </Button>
                          <Button name="dir" value="remove" variant="secondary">
                            Remove
                          </Button>
                        </form>
                        {v.available === 0 && v.reserved === 0 && v.removable && (
                          <form action={removeFactorySizeAction} className="mt-1.5">
                            <input type="hidden" name="variantId" value={v.id} />
                            <Button variant="ghost" className="w-full">
                              Take {size} off the listing
                            </Button>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <Link
                  href={`/seller/products/${p.id}`}
                  className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-accent underline"
                >
                  {p.variants.length ? "Edit or add a size" : "Add sizes and stock"}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
