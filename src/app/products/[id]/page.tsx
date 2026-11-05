import { ProductScore } from "@/components/product-score";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/client";
import { ProductImage } from "@/components/cart-bits";
import { Card } from "@/components/ui";
import { siteName } from "@/lib/brand-rules";
import { formatLKR } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { editableCartsFor, joinableCart } from "@/server/carts/queries";
import { getProduct } from "@/server/catalogue";
import { ratingSummaries, productRatingSummaries } from "@/server/ratings";
import { FactoryRating } from "@/components/factory-rating";
import { AddToCartForm, SizeStockPreview } from "./add-to-cart-form";

export async function generateMetadata({ params }: PageProps<"/products/[id]">): Promise<Metadata> {
  const p = await getProduct((await params).id);
  return { title: p?.title ?? "Product" };
}

export default async function ProductPage({ params, searchParams }: PageProps<"/products/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [product, user] = await Promise.all([getProduct(id), getCurrentUser()]);
  if (!product) notFound();
  const wanted = typeof sp.cart === "string" ? sp.cart.toUpperCase() : undefined;
  const [carts, ratings, productScores] = await Promise.all([
    user
      ? editableCartsFor(user.id)
      : Promise.resolve([] as Awaited<ReturnType<typeof editableCartsFor>>),
    ratingSummaries([product.sellerId]),
    productRatingSummaries([product.id]),
  ]);
  // Came from a shared cart they haven't joined yet: adding to it joins it.
  if (user && wanted && carts.length === 0 && !carts.some((c) => c.code === wanted)) {
    const shared = await joinableCart(wanted);
    if (shared) carts.unshift(shared);
  }

  return (
    <>
      <BackLink fallback={wanted ? `/shop?cart=${wanted}` : "/shop"} />
      <div className="grid gap-8 md:grid-cols-2 [&>*]:min-w-0">
        <ProductImage {...product} />
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm text-subtle">{product.brand}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{product.title}</h1>
            <FactoryRating
              factory={product.seller}
              rating={product.sellerId ? ratings.get(product.sellerId) : undefined}
              className="mt-1 text-sm text-subtle"
            />
            <ProductScore score={productScores.get(product.id)} />
            <p className="mt-2 text-2xl font-bold">
              {formatLKR(product.price)}
              {product.retailPrice && (
                <span className="ml-2 text-base font-normal text-subtle line-through">
                  {formatLKR(product.retailPrice)}
                </span>
              )}
            </p>
            {product.brandUrl && product.retailPrice && (
              <a
                href={product.brandUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-1 inline-block text-sm text-accent underline"
              >
                {formatLKR(product.retailPrice)} on {siteName(product.brandUrl)} ↗
              </a>
            )}
          </div>

          {product.description && (
            <p className="text-sm whitespace-pre-line">{product.description}</p>
          )}

          <Card>
            {user ? (
              <AddToCartForm
                productId={product.id}
                price={product.price.toString()}
                variants={product.variants.map((v) => ({
                  id: v.id,
                  label: v.colour ? `${v.size} · ${v.colour}` : v.size,
                  available: v.available,
                }))}
                carts={carts.map((c) => ({ id: c.id, code: c.code, label: c.name || c.code }))}
                preselect={carts.find((c) => c.code === wanted)?.id}
              />
            ) : (
              <div className="flex flex-col gap-4">
                <SizeStockPreview
                  variants={product.variants.map((v) => ({
                    id: v.id,
                    label: v.colour ? `${v.size} · ${v.colour}` : v.size,
                    available: v.available,
                  }))}
                />
                <p className="text-sm">
                  <Link
                    href={`/sign-in?next=${encodeURIComponent(`/products/${product.id}${wanted ? `?cart=${wanted}` : ""}`)}`}
                    className="font-medium text-accent underline"
                  >
                    Sign in
                  </Link>{" "}
                  to add this to a group cart.
                </p>
              </div>
            )}
          </Card>
          <p className="text-xs text-subtle">
            Items are held for you as soon as they&apos;re in a cart, and go back on sale if the
            cart expires or you remove them.
          </p>
        </div>
      </div>
    </>
  );
}
