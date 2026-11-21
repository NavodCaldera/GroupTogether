import type { Metadata } from "next";
import { Card, Input, PageHeader } from "@/components/ui";
import { ancestors } from "@/lib/categories";
import { setCategoryCommissionAction } from "@/server/admin-actions";
import { requireAdmin } from "@/server/auth/session";
import { loadCategoryTree } from "@/server/categories";
import { getSettings } from "@/server/settings";
import { AdminForm } from "../../admin-form";

export const metadata: Metadata = { title: "Commission" };

/** Commission percent and minimum per category (DEAL-004), set by the core admin. */
export default async function CommissionPage() {
  await requireAdmin("CORE");
  const [tree, settings] = await Promise.all([loadCategoryTree(), getSettings()]);
  const flat = settings.commissionPerPiece.toFixed(2);
  return (
    <div className="flex min-w-0 max-w-3xl flex-col gap-5">
      <PageHeader title="Commission" />
      <p className="text-sm">
        <span>Flat per piece </span>
        <span className="font-semibold">LKR {flat}</span>
      </p>
      <div className="flex flex-col gap-3">
        {[...tree.values()].map((c) => {
          const depth = ancestors(tree, c.id).length - 1;
          return (
            <Card
              key={c.id}
              className="min-w-0"
              style={{ marginInlineStart: `${Math.min(depth, 4)}rem` }}
            >
              <AdminForm
                action={setCategoryCommissionAction}
                submit="Save"
                variant="secondary"
                className="flex flex-wrap items-end gap-3"
              >
                <input type="hidden" name="categoryId" value={c.id} />
                <h2 className="w-full font-semibold">{c.name}</h2>
                <label className="flex min-w-0 flex-col gap-1.5 text-sm font-bold">
                  Percent
                  <Input
                    name="commissionPct"
                    inputMode="decimal"
                    defaultValue={c.commissionPct ?? ""}
                    className="w-28"
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1.5 text-sm font-bold">
                  Minimum (LKR)
                  <Input
                    name="minCommission"
                    inputMode="decimal"
                    defaultValue={c.minCommission ?? ""}
                    className="w-32"
                  />
                </label>
              </AdminForm>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
