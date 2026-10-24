import type { Metadata } from "next";
import { BackLink } from "@/components/client";
import { Card, PageHeader } from "@/components/ui";
import { requireSeller } from "@/server/auth/session";
import { db } from "@/server/db";
import { designChoices } from "@/server/designs";
import { BrandOfferForm } from "../brand-offer-form";
import { OfferForm } from "../offer-form";

export const metadata: Metadata = { title: "Add product" };

export default async function NewOfferPage({ searchParams }: PageProps<"/seller/new">) {
  const seller = await requireSeller();
  const [designs, me] = await Promise.all([
    designChoices(seller.id),
    db.user.findUniqueOrThrow({
      where: { id: seller.id },
      select: { isBrand: true, website: true },
    }),
  ]);
  const { design } = await searchParams;
  // "Offer the bulk" on a tested design opens the form on that design.
  const picked = designs.find((d) => d.id === design)?.id;
  return (
    <div className="mx-auto w-full max-w-lg">
      <BackLink fallback="/seller" />
      <PageHeader title="Add product" />
      <Card>
        {me.isBrand ? (
          <BrandOfferForm website={me.website} />
        ) : (
          <OfferForm designs={designs} design={picked} />
        )}
      </Card>
    </div>
  );
}
