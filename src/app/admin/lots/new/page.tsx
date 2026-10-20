import type { Metadata } from "next";
import { BackLink } from "@/components/client";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/server/auth/session";
import { LotForm } from "../lot-form";

export const metadata: Metadata = { title: "Add lot" };

export default async function NewLotPage() {
  await requireAdmin();
  return (
    <div className="max-w-xl">
      <BackLink fallback="/admin/lots" />
      <PageHeader title="Add lot" />
      <Card>
        <LotForm />
      </Card>
    </div>
  );
}
