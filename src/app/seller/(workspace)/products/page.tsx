import type { Metadata } from "next";
import Link from "next/link";
import { ProductImage } from "@/components/cart-bits";
import { Badge, Button, EmptyState, cx } from "@/components/ui";
import { stockAlert } from "@/lib/factory-insights";
import { seesMoney } from "@/lib/factory-roles";
import { formatLKR } from "@/lib/format";
import { requireFactory } from "@/server/auth/session";
import { factoryProducts } from "@/server/factory-dashboard";
import { factorySizeStockAction, removeFactorySizeAction } from "@/server/seller-actions";
import { pcs } from "@/app/seller/factory-bits";
import { FactoryShell, Ticket } from "@/app/seller/factory-bits";

export const metadata: Metadata = { title: "Products" };

/**
 * The factory's listings (product owner, 2026-11-03), each a ticket: price and sold (paid) on top,
 * then one row per size with the stock left large, pieces sold, and what is held in carts not
 * paid yet (not a sale). Stock changes inline with no client script. A listing shows in the shop
 * only while it has stock and isn't hidden by us.
 */
export default async function FactoryProductsPage() {
  const seller = await requireFactory("products");
  const products = await factoryProducts(seller.factoryId);
  const money = seesMoney(seller.factoryRole);
  return (
    <FactoryShell
      active="products"
      role={seller.factoryRole}
      title="Products"
      action={
        <Link
          href="/seller/new"
          className="inline-flex min-h-12 shrink-0 items-center rounded-md border-2 border-ink px-3 font-bold"
        >
          Add product
        </Link>
      }
    >
      {products.length === 0 ? (
        <EmptyState title="No products yet">
          <Link href="/seller/new" className="font-bold text-accent underline">
            Add your first product
          </Link>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-5">
          {products.map((p) => {
            const inStock = p.variants.some((v) => v.available > 0);
            return (
              <li key={p.id} id={`p-${p.id}`} className="scroll-mt-20">
                <Ticket
                  head={
                    <div className="flex w-full gap-3">
                      <div className="w-16 shrink-0">
                        <ProductImage {...p} className="text-2xl" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            href={`/seller/products/${p.id}`}
                            className="text-lg leading-tight font-bold break-words underline-offset-2 hover:underline"
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
                        <p className="tabular-nums">{formatLKR(p.price)}</p>
                        <p className="text-sm tabular-nums">
                          Sold (paid) {pcs(p.pieces)}
                          {money && `, ${formatLKR(p.value)}`}
                        </p>
                      </div>
                    </div>
                  }
                  foot={
                    <Link
                      href={`/seller/products/${p.id}`}
                      className="inline-flex min-h-11 items-center font-bold text-accent underline"
                    >
                      {p.variants.length ? "Edit details or add a size" : "Add sizes and stock"}
                    </Link>
                  }
                >
                  {p.variants.length === 0 ? (
                    <p className="text-sm">No sizes yet</p>
                  ) : (
                    <ul className="flex flex-col divide-y-2 divide-dashed divide-line">
                      {p.variants.map((v) => {
                        const alert = stockAlert(v.available);
                        const size = v.colour ? `${v.size}, ${v.colour}` : v.size;
                        return (
                          <li key={v.id} aria-label={`Size ${size}`} className="py-3 first:pt-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-xl font-bold">
                                {size}
                                {p.bestSize === v.size && (
                                  <span className="ml-2 align-middle text-sm font-normal">
                                    <Badge tone="good">Best seller</Badge>
                                  </span>
                                )}
                              </span>
                              <span
                                className={cx(
                                  "text-2xl font-bold tabular-nums",
                                  alert === "sold-out" && "text-danger",
                                  alert === "low" && "text-warn",
                                )}
                              >
                                {alert === "sold-out" ? "Sold out" : `${v.available} left`}
                              </span>
                            </div>
                            <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 text-sm tabular-nums">
                              <dt>Sold (paid)</dt>
                              <dd className="text-right">{v.soldPaid}</dd>
                              <dt className="text-subtle">Wanted in active carts, not sales yet</dt>
                              <dd className="text-right text-subtle">{v.reserved}</dd>
                            </dl>
                            <form
                              action={factorySizeStockAction}
                              className="mt-2 grid grid-cols-[1fr_auto_auto] gap-1.5"
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
                                className="min-h-12 min-w-0 rounded-md border-2 border-line bg-paper px-3 text-base focus:border-ink"
                              />
                              <Button name="dir" value="add" className="min-h-12">
                                Add
                              </Button>
                              <Button
                                name="dir"
                                value="remove"
                                variant="secondary"
                                className="min-h-12"
                              >
                                Remove
                              </Button>
                            </form>
                            {v.available === 0 && v.reserved === 0 && v.removable && (
                              <form action={removeFactorySizeAction} className="mt-1.5">
                                <input type="hidden" name="variantId" value={v.id} />
                                <Button variant="ghost" className="min-h-11 w-full">
                                  Take {size} off this product
                                </Button>
                              </form>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Ticket>
              </li>
            );
          })}
        </ul>
      )}
    </FactoryShell>
  );
}
