import { AdminForm } from "@/app/admin/admin-form";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { acceptSampleAction, requestSampleAction } from "@/server/sample-actions";
export default async function SamplesPage() {
  const user = await requireUser(["CUSTOMER"], "/samples");
  const [carts, products, samples] = await Promise.all([
    db.groupCart.findMany({
      where: { ownerId: user.id, status: { in: ["OPEN", "READY"] }, expiresAt: { gt: new Date() } },
      select: { id: true, code: true },
    }),
    db.product.findMany({
      where: {
        category: "APPAREL",
        variants: { some: { available: { gt: 0 } } },
        OR: [{ sellerId: null }, { seller: { isBrand: false } }],
      },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
    db.sampleRequest.findMany({
      where: {
        OR: [{ requesterId: user.id }, { cart: { members: { some: { userId: user.id } } } }],
      },
      select: {
        id: true,
        requesterId: true,
        status: true,
        designNote: true,
        transportFee: true,
        note: true,
        courier: true,
        tracking: true,
        product: { select: { title: true } },
        cart: { select: { code: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageHeader title="Design samples" />
      <p className="text-sm">
        Request a sample before your group buys. No sample sending fee. Your group pays transport.
      </p>
      {carts.length > 0 && products.length > 0 ? (
        <Card>
          <AdminForm action={requestSampleAction} submit="Request sample">
            <Field name="cartId" label="Group">
              <Select name="cartId">
                {carts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field name="productId" label="Design">
              <Select name="productId">
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field name="designNote" label="Pattern / size details">
              <Input name="designNote" maxLength={500} />
            </Field>
          </AdminForm>
        </Card>
      ) : (
        <p className="text-sm text-subtle">
          The group owner can request samples while the group is open, before accepting a purchase.
        </p>
      )}
      {samples.map((s) => (
        <Card key={s.id} className="flex flex-col gap-3">
          <h2 className="font-semibold">
            {s.product.title} · {s.cart.code}
          </h2>
          <p>
            {s.status.toLowerCase()}
            {s.designNote ? ` · ${s.designNote}` : ""}
          </p>
          {s.transportFee !== null && (
            <p>
              Group transport: {formatLKR(s.transportFee)} · Sample sending fee: {formatLKR("0")}
            </p>
          )}
          {s.note && <p>{s.note}</p>}
          {s.courier && (
            <p>
              {s.courier} · {s.tracking}
            </p>
          )}
          {s.status === "QUOTED" && s.requesterId === user.id && (
            <AdminForm action={acceptSampleAction} submit="Accept group transport cost">
              <input type="hidden" name="id" value={s.id} />
              <input
                type="hidden"
                name="expectedTransportFee"
                value={s.transportFee?.toString() ?? ""}
              />
            </AdminForm>
          )}
        </Card>
      ))}
    </div>
  );
}
