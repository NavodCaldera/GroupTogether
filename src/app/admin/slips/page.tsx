import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { approveSlipAction, rejectSlipAction } from "@/server/admin-actions";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { AdminForm } from "../admin-form";
import { Chip, ChipRow, Count, Table, param } from "../list-bits";

export const metadata: Metadata = { title: "Bank slips" };

export default async function SlipsPage({ searchParams }: PageProps<"/admin/slips">) {
  await requireAdmin();
  const history = param(await searchParams, "view") === "history";
  const tabs = (pending: number) => (
    <ChipRow>
      <Chip href="/admin/slips" active={!history}>
        To review <Count n={pending} />
      </Chip>
      <Chip href="/admin/slips?view=history" active={history}>
        Reviewed
      </Chip>
    </ChipRow>
  );
  if (history)
    return (
      <SlipHistory tabs={tabs(await db.paymentSlip.count({ where: { status: "PENDING" } }))} />
    );

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
      {tabs(slips.length)}
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

async function SlipHistory({ tabs }: { tabs: ReactNode }) {
  const slips = await db.paymentSlip.findMany({
    where: { status: { in: ["APPROVED", "REJECTED"] } },
    include: {
      cart: { select: { code: true } },
      uploader: { select: { name: true } },
      reviewer: { select: { name: true } },
    },
    orderBy: { reviewedAt: "desc" },
    take: 100,
  });
  return (
    <>
      <PageHeader title="Reviewed bank slips" description="The latest 100 decisions." />
      {tabs}
      {slips.length === 0 ? (
        <EmptyState title="No slips reviewed yet" />
      ) : (
        <Table
          head={
            <>
              <th>Reviewed</th>
              <th>Cart</th>
              <th>Owner</th>
              <th className="text-right">Amount</th>
              <th>Result</th>
              <th>By</th>
              <th>Note</th>
              <th>Slip</th>
            </>
          }
        >
          {slips.map((s) => (
            <tr key={s.id}>
              <td className="text-subtle">{formatDateTime(s.reviewedAt)}</td>
              <td>
                <Link
                  href={`/admin/carts/${s.cart.code}`}
                  className="font-mono text-accent underline"
                >
                  {s.cart.code}
                </Link>
              </td>
              <td>{s.uploader.name}</td>
              <td className="text-right">{formatLKR(s.amount)}</td>
              <td>
                <Badge tone={s.status === "APPROVED" ? "good" : "bad"}>
                  {s.status === "APPROVED" ? "Approved" : "Rejected"}
                </Badge>
              </td>
              <td>{s.reviewer?.name ?? "—"}</td>
              <td className="max-w-64 truncate text-subtle" title={s.reviewNote ?? undefined}>
                {s.reviewNote ?? ""}
              </td>
              <td>
                <a
                  href={`/api/slips/${s.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline"
                >
                  Open
                </a>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
