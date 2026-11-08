import Link from "next/link";
import { AdminForm } from "@/app/admin/admin-form";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { stockToReceive } from "@/server/receiving";
import { updateSampleAction } from "@/server/sample-actions";
export default async function WarehousePage() {
  await requireAdmin("AGENTS");
  const [samples, receiving] = await Promise.all([
    db.sampleRequest.findMany({
      include: { product: { select: { title: true } }, cart: { select: { code: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    stockToReceive(),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Warehouse and delivery" />
      <div className="flex flex-wrap gap-4 text-accent underline">
        <Link href="/admin/orders">Paid orders and delivery</Link>
        <Link href="/admin/slips">Payment review</Link>
        <Link href="/admin/carts">Group orders</Link>
      </div>
      <h2 className="font-semibold">Incoming factory stock ({receiving.length})</h2>
      {receiving.map((r) => (
        <Card key={r.id}>
          {r.name} · {r.seller.company || r.seller.name}
        </Card>
      ))}
      <h2 className="font-semibold">Group design samples</h2>
      {samples.length === 0 && <p>No sample requests.</p>}
      {samples.map((s) => (
        <Card key={s.id} className="flex flex-col gap-3">
          <h3 className="font-semibold">
            {s.product.title} · {s.cart.code}
          </h3>
          <p>
            {s.status.toLowerCase()} · {s.designNote}
          </p>
          <p>
            {s.recipientName} · {s.phone}
            <br />
            {s.address}, {s.city}
          </p>
          {s.transportFee !== null && (
            <p>Group transport: {formatLKR(s.transportFee)} · No sample sending fee</p>
          )}
          {s.courier && (
            <p>
              {s.courier} · {s.tracking}
            </p>
          )}
          {s.note && <p>{s.note}</p>}
          {["REQUESTED", "QUOTED", "ACCEPTED", "DISPATCHED"].includes(s.status) && (
            <AdminForm action={updateSampleAction} submit="Update sample">
              <input type="hidden" name="id" value={s.id} />
              <Field name={`status-${s.id}`} label="Next step">
                <Select id={`status-${s.id}`} name="status">
                  {s.status === "REQUESTED" || s.status === "QUOTED" ? (
                    <>
                      <option value="QUOTED">Quote group transport</option>
                      <option value="DECLINED">Decline request</option>
                    </>
                  ) : s.status === "ACCEPTED" ? (
                    <option value="DISPATCHED">Dispatch accepted sample</option>
                  ) : (
                    <option value="DELIVERED">Mark delivered</option>
                  )}
                </Select>
              </Field>
              {["REQUESTED", "QUOTED"].includes(s.status) && (
                <Field name={`fee-${s.id}`} label="Group transport quote (LKR)">
                  <Input
                    id={`fee-${s.id}`}
                    name="transportFee"
                    inputMode="decimal"
                    defaultValue={s.transportFee?.toString()}
                  />
                </Field>
              )}
              {s.status === "ACCEPTED" && (
                <>
                  <Field name={`courier-${s.id}`} label="Courier">
                    <Input id={`courier-${s.id}`} name="courier" required maxLength={100} />
                  </Field>
                  <Field name={`tracking-${s.id}`} label="Tracking reference">
                    <Input id={`tracking-${s.id}`} name="tracking" required maxLength={300} />
                  </Field>
                </>
              )}
              <Field name={`note-${s.id}`} label="Note shared with group">
                <Input id={`note-${s.id}`} name="note" maxLength={500} />
              </Field>
            </AdminForm>
          )}
        </Card>
      ))}
    </div>
  );
}
