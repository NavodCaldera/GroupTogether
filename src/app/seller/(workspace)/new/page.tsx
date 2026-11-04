import type { Metadata } from "next";
import { BackLink } from "@/components/client";
import { Card, PageHeader } from "@/components/ui";
import { requireSeller } from "@/server/auth/session";
import { db } from "@/server/db";
import { BrandOfferForm } from "@/app/seller/brand-offer-form";
import { ProductForm } from "@/app/admin/products/product-form";
import { saveFactoryProductAction } from "@/server/seller-actions";
import { snapshotTerms } from "@/server/brand-reviews";
import { notFound, redirect } from "next/navigation";
import { canFactory, factoryOf } from "@/lib/factory-roles";

export const metadata: Metadata = { title: "Add product" };

export default async function NewOfferPage({ searchParams }: PageProps<"/seller/new">) {
  const seller = await requireSeller();
  const login = await db.user.findUniqueOrThrow({
    where: { id: seller.id },
    select: { id: true, isBrand: true, factoryId: true, factoryRole: true },
  });
  // Brands add gift products here; factory staff need a job that edits listings (2026-11-04).
  const { factoryId, factoryRole } = factoryOf(login);
  if (!login.isBrand && !canFactory(factoryRole, "products")) redirect("/seller");
  const me = await db.user.findUniqueOrThrow({
    where: { id: factoryId },
    select: { isBrand: true, website: true, company: true, name: true },
  });
  const { offerId } = await searchParams;
  const offer =
    me.isBrand && typeof offerId === "string"
      ? await db.stockOffer.findFirst({
          where: { id: offerId, sellerId: factoryId },
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
