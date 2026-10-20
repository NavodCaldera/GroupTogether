import type { Metadata } from "next";
import { BackLink } from "@/components/client";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/server/auth/session";
import { lotChoices } from "@/server/lots";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Add product" };

export default async function NewProductPage({ searchParams }: PageProps<"/admin/products/new">) {
  await requireAdmin();
  const lot = (await searchParams).lot;
  const lots = await lotChoices();
  return (
    <div className="max-w-xl">
      <BackLink fallback="/admin/products" />
      <PageHeader title="Add product" />
      <Card>
        <ProductForm lots={lots} lotId={typeof lot === "string" ? lot : undefined} />
      </Card>
    </div>
  );
}
