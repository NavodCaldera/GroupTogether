import type { Metadata } from "next";
import { BackLink } from "@/components/client";
import { Card, PageHeader } from "@/components/ui";
import { requireSeller } from "@/server/auth/session";
import { db } from "@/server/db";
import { BrandOfferForm } from "../brand-offer-form";
import { ProductForm } from "@/app/admin/products/product-form";
import { saveFactoryProductAction } from "@/server/seller-actions";
import { snapshotTerms } from "@/server/brand-reviews";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Add product" };

export default async function NewOfferPage({ searchParams }: PageProps<"/seller/new">) {
  const seller = await requireSeller();
  const [me] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: seller.id },
      select: { isBrand: true, website: true, company: true, name: true },
    }),
  ]);
  const { offerId } = await searchParams;
  const offer =
    me.isBrand && typeof offerId === "string"
      ? await db.stockOffer.findFirst({
          where: { id: offerId, sellerId: seller.id },
          include: { revisions: { orderBy: { version: "desc" }, take: 1 } },
        })
      : null;
  if (me.isBrand && typeof offerId === "string" && !offer) notFound();
  const revision = offer
    ? { ...offer, ...(offer.revisions[0] ? snapshotTerms(offer.revisions[0].snapshot) : {}) }
    : null;
  return (
    <div className="mx-auto w-full max-w-lg">
      <BackLink fallback="/seller" />
      <PageHeader
        title={me.isBrand ? (revision ? "Revise gift product" : "Add gift product") : "Add product"}
      />
      <Card>
        {me.isBrand ? (
          <BrandOfferForm
            website={me.website}
            defaults={
              revision
                ? {
                    id: revision.id,
                    revision: revision.revision,
                    name: revision.name,
                    description: revision.description,
                    actualPrice: revision.actualPrice?.toString() ?? "",
                    offerPrice: revision.offerPrice?.toString() ?? "",
                    pieces: revision.pieces ?? 1,
                    productUrl: revision.productUrl ?? "",
                    photoKey: revision.photoKey,
                    packDetails: revision.packDetails,
                    packSize: revision.packSize,
                    dispatchDays: revision.dispatchDays,
                    hasExpiry: revision.hasExpiry,
                    expiryDate: revision.expiryDate?.toISOString().slice(0, 10) ?? "",
                    minShelfLifeDays: revision.minShelfLifeDays,
                  }
                : undefined
            }
          />
        ) : (
          <ProductForm
            factory={{ brand: me.company || me.name }}
            action={saveFactoryProductAction}
          />
        )}
      </Card>
    </div>
  );
}
