import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/client";
import { MaterialCardView } from "@/components/materials/material-card-view";
import { Card, PageHeader } from "@/components/ui";
import { getProduct, shopProductsWithMaterial } from "@/server/catalogue";
import { getMaterialCard } from "@/server/materials";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Compare materials" };

/** Two products' Material Cards side by side (DEC-022) */
export default async function ComparePage({
  params,
  searchParams,
}: PageProps<"/products/[id]/compare">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const withId = typeof sp.with === "string" ? sp.with : null;
  await requireUser(
    [],
    `/products/${id}/compare${withId ? `?with=${encodeURIComponent(withId)}` : ""}`,
  );
  const [product, card] = await Promise.all([getProduct(id), getMaterialCard(id)]);
  if (!product || !card) notFound();
  const other = withId && withId !== id ? await getProduct(withId) : null;
  const otherCard = other ? await getMaterialCard(other.id) : null;
  const choices = otherCard ? [] : await shopProductsWithMaterial(id);

  return (
    <>
      <BackLink fallback={`/products/${id}`} />
      <PageHeader title="Compare materials" />
      <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <p className="mb-2 text-sm text-subtle">{product.title}</p>
          <MaterialCardView card={card} why={null} />
        </Card>
        {other && otherCard ? (
          <Card>
            <p className="mb-2 text-sm text-subtle">
              <Link href={`/products/${other.id}`} className="underline">
                {other.title}
              </Link>
            </p>
            <MaterialCardView card={otherCard} why={null} />
            <Link
              href={`/products/${id}/compare`}
              className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-accent underline sm:min-h-10"
            >
              Choose another
            </Link>
          </Card>
        ) : (
          <Card>
            <h2 className="mb-2 font-semibold">Compare with</h2>
            {choices.length ? (
              <ul className="flex flex-col">
                {choices.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/products/${id}/compare?with=${c.id}`}
                      className="flex min-h-11 items-center underline sm:min-h-10"
                    >
                      {c.title} · {c.brand}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-subtle">No other products yet</p>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
