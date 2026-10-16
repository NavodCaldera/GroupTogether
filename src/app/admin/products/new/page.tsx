import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/server/auth/session";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Add product" };

export default async function NewProductPage() {
  await requireAdmin();
  return (
    <div className="max-w-xl">
      <PageHeader title="Add product" description="Add sizes and stock after creating it." />
      <Card>
        <ProductForm />
      </Card>
    </div>
  );
}
