import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { approveSlipAction, rejectSlipAction } from "@/server/admin-actions";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { AdminForm } from "../admin-form";

export const metadata: Metadata = { title: "Bank slips" };

export default async function SlipsPage() {
  await requireAdmin();
  const slips = await db.paymentSlip.findMany({
    where: { status: "PENDING" },
    include: {
      cart: { select: { code: true, name: true, total: true } },
      uploader: { select: { name: true, phone: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return (
    <>
      <PageHeader
        title="Bank slips to review"
        description="Check the amount and the reference (the cart code) against the bank account before approving."
      />
      {slips.length === 0 ? (
        <EmptyState title="No slips waiting" />
      ) : (
        <div className="flex flex-col gap-4">
          {slips.map((s) => (
            <Card key={s.id} className="grid gap-4 md:grid-cols-[1fr_auto]">
              <div className="text-sm">
                <p className="text-lg font-semibold">{formatLKR(s.amount)}</p>
                <p>
                  Cart{" "}
                  <Link
                    href={`/admin/carts/${s.cart.code}`}
                    className="font-mono text-accent underline"
                  >
                    {s.cart.code}
                  </Link>{" "}
                  {s.cart.name && `· ${s.cart.name}`}
                </p>
                <p className="text-subtle">
                  {s.uploader.name} · {s.uploader.phone} · {s.uploader.email}
                </p>
                <p className="text-subtle">Uploaded {formatDateTime(s.createdAt)}</p>
                <a
                  href={`/api/slips/${s.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block font-medium text-accent underline"
                >
                  Open the slip ({s.contentType === "application/pdf" ? "PDF" : "image"})
                </a>
              </div>
              <div className="flex flex-col gap-3 md:w-72">
                <AdminForm action={approveSlipAction} submit="Approve and confirm order">
                  <input type="hidden" name="slipId" value={s.id} />
                </AdminForm>
                <AdminForm action={rejectSlipAction} submit="Reject" variant="secondary">
                  <input type="hidden" name="slipId" value={s.id} />
                  <Input name="note" placeholder="Why? e.g. Amount doesn't match" required />
                </AdminForm>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
