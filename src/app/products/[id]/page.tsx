import { ProductScore } from "@/components/product-score";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/client";
import { ProductImage } from "@/components/cart-bits";
import { Card } from "@/components/ui";
import { siteName } from "@/lib/brand-rules";
import { formatLKR } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getProduct } from "@/server/catalogue";
import { ratingSummaries, productRatingSummaries } from "@/server/ratings";
import { FactoryRating } from "@/components/factory-rating";
import { isBuyerRole } from "@/lib/roles";
import { getFitView } from "@/server/fit";
import { AddToCartForm, SizeStockPreview } from "./add-to-cart-form";
import { FitSection } from "./fit-section";
import { MaterialSection } from "./material-card";
import { getMaterialCard, getProvenance } from "@/server/materials";
import { sizesFor } from "@/lib/taxonomy";
import { optionAxes, optionName, readOptions } from "@/lib/variant-options";

export async function generateMetadata({ params }: PageProps<"/products/[id]">): Promise<Metadata> {
  const p = await getProduct((await params).id);
  return { title: p?.title ?? "Product" };
}

export default async function ProductPage({ params, searchParams }: PageProps<"/products/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  // A shared basket link carries its agent through the cart to checkout.
  const agent =
    typeof sp.agent === "string" && /^[a-z0-9]{1,40}$/.test(sp.agent) ? sp.agent : undefined;
  const keep = agent ? `?agent=${agent}` : "";
  // Product pages are for signed-in users; visitors sign in and come straight back (owner,
  // 2026-11-21).
  const user = await requireUser([], `/products/${id}${keep}`);
  const product = await getProduct(id);
  if (!product) notFound();
  const buyer = isBuyerRole(user.role);
  const [ratings, productScores, fit, materialCard] = await Promise.all([
    ratingSummaries([product.sellerId]),
    productRatingSummaries([product.id]),
    getFitView(product.id, buyer ? user.id : null),
    getMaterialCard(product.id),
  ]);
  const why = materialCard ? await getProvenance(materialCard) : null;
  const variants = product.variants.map((v) => ({
    id: v.id,
    options: readOptions(v.options),
    available: v.available,
  }));
  // Choices grouped by the option names the variants carry; sizes in the category's own order.
  const axes = optionAxes(variants, sizesFor(product.kind ?? undefined)).map((a) => ({
    ...a,
    name: optionName(a.key),
  }));

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
            {buyer ? (
              <AddToCartForm
                price={product.price.toString()}
                variants={variants}
                axes={axes}
                cartHref={`/cart${keep}`}
              />
            ) : (
              <SizeStockPreview variants={variants} axes={axes} />
            )}
          </Card>
        </div>
      </div>
      <FitSection
        view={fit}
        productId={product.id}
        buyer={buyer}
        materialCard={
          materialCard && <MaterialSection card={materialCard} why={why} productId={product.id} />
        }
      />
    </>
  );
}
