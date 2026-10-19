import type { Metadata } from "next";
import { BackLink } from "@/components/client";
import { Card, PageHeader } from "@/components/ui";
import { requireSeller } from "@/server/auth/session";
import { OfferForm } from "../offer-form";

export const metadata: Metadata = { title: "Add product" };

export default async function NewOfferPage() {
  await requireSeller();
  return (
    <div className="mx-auto w-full max-w-lg">
      <BackLink fallback="/seller" />
      <PageHeader title="Add product" />
      <Card>
        <OfferForm />
      </Card>
    </div>
  );
}
