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
import { getProduct } from "@/server/catalogue";
import { ratingSummaries, productRatingSummaries } from "@/server/ratings";
import { FactoryRating } from "@/components/factory-rating";
import { isBuyerRole } from "@/lib/roles";
import { AddToCartForm, SizeStockPreview } from "./add-to-cart-form";

export async function generateMetadata({ params }: PageProps<"/products/[id]">): Promise<Metadata> {
  const p = await getProduct((await params).id);
  return { title: p?.title ?? "Product" };
}

export default async function ProductPage({ params, searchParams }: PageProps<"/products/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [product, user] = await Promise.all([getProduct(id), getCurrentUser()]);
  if (!product) notFound();
  // A shared basket link carries its agent through the cart to checkout.
  const agent =
    typeof sp.agent === "string" && /^[a-z0-9]{1,40}$/.test(sp.agent) ? sp.agent : undefined;
  const keep = agent ? `?agent=${agent}` : "";
  const [ratings, productScores] = await Promise.all([
    ratingSummaries([product.sellerId]),
    productRatingSummaries([product.id]),
  ]);

  return (
    <>
      <BackLink fallback={`/shop${keep}`} />
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
            {user && isBuyerRole(user.role) ? (
              <AddToCartForm
                price={product.price.toString()}
                variants={product.variants.map((v) => ({
                  id: v.id,
                  label: v.colour ? `${v.size} · ${v.colour}` : v.size,
                  available: v.available,
                }))}
                cartHref={`/cart${keep}`}
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
                {!user && (
                  <Link
                    href={`/sign-in?next=${encodeURIComponent(`/products/${product.id}${keep}`)}`}
                    className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline sm:min-h-10"
                  >
                    Sign in to buy
                  </Link>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
