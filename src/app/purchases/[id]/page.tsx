import { notFound } from "next/navigation";
import { BackLink } from "@/components/client";
import { ActionForm } from "@/components/resale-forms";
import { Alert, Badge, Card, Input, PageHeader } from "@/components/ui";
import { formatDate, formatLKR } from "@/lib/format";
import { redirectCompany, requireUser } from "@/server/auth/session";
import { purchase } from "@/server/resale";
import { listAction } from "@/server/resale-actions";

const AUDIENCE = [
  ["BOTH", "Both"],
  ["CONTACTS", "My contacts"],
  ["NEARBY", "Nearby buyers"],
] as const;

/** One purchased basket: the items as bought, what each unit cost, and a resell form for each. */
export default async function PurchasePage({ params }: PageProps<"/purchases/[id]">) {
  const id = (await params).id;
  const user = await requireUser(`/purchases/${id}`);
  await redirectCompany();
  const p = await purchase(user.id, id);
  if (!p) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <BackLink fallback="/purchases" />
        <PageHeader
          title={`${p.companyName} · ${p.packName}`}
          description={`${formatLKR(p.price)} · ${p.size} families · ${formatDate(p.paidAt)}`}
          actions={p.ordered ? <Badge tone="good">Ordered</Badge> : null}
        />
      </div>
      {!p.ordered ? <Alert tone="info">Resale opens once the basket is ordered.</Alert> : null}
      <ul className="flex flex-col gap-3">
        {p.items.map((it) => (
          <li key={it.id}>
            <Card className="flex flex-col gap-3" data-testid="purchase-item">
              <div className="flex items-center gap-3">
                {it.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.photo}
                    alt=""
                    className="size-14 shrink-0 rounded-lg bg-muted object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {it.name} <span className="font-normal text-subtle">{it.size}</span>
                  </p>
                  <p className="text-sm">
                    Bought {it.qty} · {it.left} left to resell
                  </p>
                  <p className="text-sm text-subtle">
                    {it.unitPrice
                      ? `${formatLKR(it.unitPrice)} each`
                      : "Original item price unavailable"}
                  </p>
                </div>
                {it.chilled ? <Badge>Chilled</Badge> : null}
              </div>
              {it.resellable && it.unitPrice ? (
                <details className="group">
                  <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-line px-4 text-sm font-medium hover:bg-muted sm:min-h-10">
                    Resell
                  </summary>
                  <ActionForm
                    act={listAction}
                    fields={{ groupId: p.groupId, itemId: it.id }}
                    label="List for resale"
                    className="mt-3 flex flex-col gap-3"
                  >
                    <label className="flex flex-col gap-1 text-sm">
                      Quantity
                      <Input
                        id={`qty-${it.id}`}
                        name="qty"
                        type="number"
                        min={1}
                        max={it.left}
                        defaultValue={1}
                        required
                        className="w-24"
                      />
                    </label>
                    <p className="text-sm">
                      Price <span className="font-semibold">{formatLKR(it.unitPrice)} each</span>
                    </p>
                    <label className="flex flex-col gap-1 text-sm">
                      Public pickup spot
                      <Input
                        id={`spot-${it.id}`}
                        name="spot"
                        required
                        minLength={3}
                        maxLength={120}
                      />
                    </label>
                    <fieldset className="flex flex-col gap-1 text-sm">
                      <legend className="mb-1">Who can see it</legend>
                      {AUDIENCE.map(([v, label]) => (
                        <label key={v} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="audience"
                            value={v}
                            defaultChecked={v === "BOTH"}
                          />
                          {label}
                        </label>
                      ))}
                    </fieldset>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="unopened" required />
                      Unopened, in the original packaging
                    </label>
                  </ActionForm>
                </details>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
