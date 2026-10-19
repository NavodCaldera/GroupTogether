import type { Metadata } from "next";
import { BackLink } from "@/components/client";
import { Card, PageHeader } from "@/components/ui";
import { requireSeller } from "@/server/auth/session";
import { ListingForm } from "../../listing-form";

export const metadata: Metadata = { title: "Add product" };

export default async function NewSellerProductPage() {
  await requireSeller();
  return (
    <div className="mx-auto w-full max-w-2xl">
      <BackLink fallback="/seller" />
      <PageHeader title="Add product" />
      <Card>
        <ListingForm />
      </Card>
    </div>
  );
}
