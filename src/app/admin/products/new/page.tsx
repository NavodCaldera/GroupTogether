import type { Metadata } from "next";
import { BackLink } from "@/components/client";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { lotChoices } from "@/server/lots";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Add product" };

export default async function NewProductPage({ searchParams }: PageProps<"/admin/products/new">) {
  await requireAdmin();
  const sp = await searchParams;
  const lot = sp.lot;
  const [lots, offer] = await Promise.all([
    lotChoices(),
    typeof sp.offer === "string"
      ? db.stockOffer.findFirst({
          where: { id: sp.offer, status: "ACCEPTED" },
          select: { id: true, name: true, actualPrice: true, productUrl: true },
        })
      : null,
  ]);
  return (
    <div className="max-w-xl">
      <BackLink fallback="/admin/products" />
      <PageHeader title="Add product" />
      <Card>
        <ProductForm
          lots={lots}
          lotId={typeof lot === "string" ? lot : undefined}
          offer={
            offer
              ? {
                  id: offer.id,
                  name: offer.name,
                  actualPrice: offer.actualPrice?.toString(),
                  productUrl: offer.productUrl ?? undefined,
                }
              : undefined
          }
        />
      </Card>
    </div>
  );
}
