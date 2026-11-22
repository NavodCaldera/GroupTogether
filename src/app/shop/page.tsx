import { ProductScore } from "@/components/product-score";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ProductImage } from "@/components/cart-bits";
import { EmptyState, PageHeader } from "@/components/ui";
import { SearchBox } from "@/components/search-box";
import { TaxonomyFields } from "@/components/taxonomy-fields";
import { formatLKR } from "@/lib/format";
import { audienceFor } from "@/lib/taxonomy";
import { audienceOfSlug, isActive, kindSlug, resolveAttributes } from "@/lib/categories";
import { getCurrentUser } from "@/server/auth/session";
import { categoryChoices, loadCategoryTree } from "@/server/categories";
import { type ProductFilters, listProducts, shopFacets } from "@/server/catalogue";
import { ratingSummaries, productRatingSummaries } from "@/server/ratings";
import { FactoryRating } from "@/components/factory-rating";

export const metadata: Metadata = { title: "Shop" };

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  // Admins don't shop; their catalogue is Admin → Products. Nor do packing staff.
  const user = await getCurrentUser();
  const role = user?.role;
  if (role === "ADMIN") redirect("/admin/products");
  if (role === "SELLER") redirect("/seller");
  const sp = await searchParams;
  const agent = one(sp.agent);
  const keep = agent && /^[a-z0-9]{1,40}$/.test(agent) ? `?agent=${agent}` : "";
  // No audience box: a buyer sees their own audience, from gender and age (owner, 2026-11-21).
  const audience = user ? (audienceFor(user.gender, user.birthDate) ?? undefined) : undefined;
  const tree = await loadCategoryTree();
  // `?kind=` is the older link form for a clothing category.
  const kind = one(sp.kind);
  const slug = one(sp.category) ?? (kind ? kindSlug(kind) : undefined);
  const picked = slug ? [...tree.values()].find((n) => n.slug === slug) : undefined;
  const category =
    picked &&
    isActive(tree, picked.id) &&
    !(audience && audienceOfSlug(picked.slug) && audienceOfSlug(picked.slug) !== audience)
      ? picked
      : undefined;
  // Filters come from the category's filterable attributes (CATG-002): variant axes match
  // Variant.options, the rest Product.specs.
  const attributes = category ? resolveAttributes(tree, category.id) : [];
  const options: Record<string, string> = {};
  const specs: Record<string, string> = {};
  for (const a of attributes) {
    const v = a.filterable ? one(sp[a.key])?.slice(0, 60) : undefined;
    if (v) (a.isVariantAxis ? options : specs)[a.key] = v;
  }
  const condition = one(sp.condition);
  const filters: ProductFilters = {
    categoryPath: category?.path,
    condition:
      condition === "NEW" ||
      condition === "FACTORY_SURPLUS" ||
      condition === "B_GRADE" ||
      condition === "REFURBISHED"
        ? condition
        : undefined,
    brand: one(sp.brand),
    options: Object.keys(options).length ? options : undefined,
    specs: Object.keys(specs).length ? specs : undefined,
    q: one(sp.q),
  };
  // No filter or search: lowest prices first. Filtered: newest first.
  const unfiltered = Object.values(filters).every((v) => v === undefined);
  const [products, groups, facets] = await Promise.all([
    listProducts({ ...filters, attributes, audience }, 60, unfiltered ? "cheapest" : "newest"),
    categoryChoices({ audience, by: "slug" }),
    shopFacets(),
  ]);
  const [ratings, productScores] = await Promise.all([
    ratingSummaries(products.map((p) => p.sellerId)),
    productRatingSummaries(products.map((p) => p.id)),
  ]);
  // 16px text on phones so iOS doesn't zoom into the field.
  const select =
    "min-h-11 min-w-0 rounded-lg border border-line bg-paper px-2 text-base sm:min-h-10 sm:text-sm";

  return (
    <>
      <PageHeader title="Shop" />
      {/* A plain GET form: filtering needs no JavaScript. */}
      {/* Phones: one box per row. Wider screens: one wrapping row. */}
      <form className="mb-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap" action="/shop">
        {keep && <input type="hidden" name="agent" value={agent} />}
        <SearchBox defaultValue={filters.q} className="sm:min-w-40 sm:flex-1" />
        <TaxonomyFields
          groups={groups}
          category={category?.slug}
          shop={{ picked: { ...options, ...specs }, optionValues: facets.options }}
          selectClass={select}
        />
        <button className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent sm:min-h-10">
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
              <Link key={p.id} href={`/products/${p.id}${keep}`} className="group">
                <ProductImage {...p} className={inStock ? "" : "opacity-50"} />
                <p className="mt-2 text-xs text-subtle">{p.brand}</p>
                <p className="line-clamp-2 text-sm font-medium group-hover:underline">{p.title}</p>
                <FactoryRating
                  factory={p.seller}
                  rating={p.sellerId ? ratings.get(p.sellerId) : undefined}
                />
                <ProductScore score={productScores.get(p.id)} />
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
