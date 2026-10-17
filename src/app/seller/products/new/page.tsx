import type { Metadata } from "next";
import { BackLink } from "@/components/client";
import { Card, PageHeader } from "@/components/ui";
import { requireSeller } from "@/server/auth/session";
import { sellerSaveProductAction } from "@/server/seller-actions";
import { ProductForm } from "../../../admin/products/product-form";

export const metadata: Metadata = { title: "Add product" };

export default async function NewSellerProductPage() {
  await requireSeller();
  return (
    <div className="max-w-2xl">
      <BackLink fallback="/seller" />
      <PageHeader
        title="Add a product"
        description="It starts as a draft. Next you add stock by size, then submit it for review."
      />
      <Card>
        <ProductForm action={sellerSaveProductAction} seller />
      </Card>
    </div>
  );
}
