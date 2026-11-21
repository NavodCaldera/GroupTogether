import { AdminForm } from "@/app/admin/admin-form";
import { Badge, Card, Field, Input } from "@/components/ui";
import { MAX_TIERS } from "@/lib/deal-rules";
import { formatDateTime, formatLKR } from "@/lib/format";
import { discardDealAction, saveDealAction, startDealAction } from "@/server/deal-actions";
import { factoryDeals } from "@/server/deals";

type Deal = Awaited<ReturnType<typeof factoryDeals>>["deals"][number];

const STATUS: Record<Deal["status"], { label: string; tone: "good" | "neutral" | "bad" }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  LIVE: { label: "Live", tone: "good" },
  CLOSED: { label: "Closing", tone: "neutral" },
  SETTLED: { label: "Closed", tone: "neutral" },
  CANCELLED: { label: "Discarded", tone: "bad" },
};

/** Colombo wall time for a datetime-local input. */
const colomboValue = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 16);

function Tiers({ deal }: { deal: Deal }) {
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr className="text-left text-subtle">
          <th className="py-1 font-medium">From</th>
          <th className="py-1 text-right font-medium">Factory</th>
          <th className="py-1 text-right font-medium">Buyer</th>
        </tr>
      </thead>
      <tbody>
        {deal.tiers.map((t) => (
          <tr key={t.minQty} className="border-t border-line">
            <td className="py-1">{t.minQty.toLocaleString("en-LK")}+</td>
            <td className="py-1 text-right">{formatLKR(t.factoryPrice)}</td>
            <td className="py-1 text-right">{formatLKR(t.buyerPrice)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Editor({ productId, deal, ends }: { productId: string; deal?: Deal; ends: Date }) {
  const rows = Array.from({ length: MAX_TIERS }, (_, i) => deal?.tiers[i]);
  return (
    <AdminForm action={saveDealAction} submit={deal ? "Save deal" : "Create deal"}>
      <input type="hidden" name="productId" value={productId} />
      {deal && <input type="hidden" name="dealId" value={deal.id} />}
      <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Ends" name="endsAt">
          <Input
            className="min-w-0"
            name="endsAt"
            type="datetime-local"
            defaultValue={colomboValue(deal?.endsAt ?? ends)}
            required
          />
        </Field>
        <Field label="Capacity (optional)" name="maxQty">
          <Input
            className="min-w-0"
            name="maxQty"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            defaultValue={deal?.maxQty ?? ""}
          />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">Tiers</legend>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4.5rem] gap-2 text-sm text-subtle">
          <span>From qty</span>
          <span>Factory price</span>
          <span className="text-right">Buyer</span>
        </div>
        {rows.map((t, i) => (
          <div
            key={i}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4.5rem] items-center gap-2"
          >
            <Input
              className="min-w-0"
              name={`minQty${i}`}
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              aria-label={`Tier ${i + 1} from quantity`}
              defaultValue={t?.minQty ?? (i === 0 ? 1 : "")}
              readOnly={i === 0}
            />
            <Input
              className="min-w-0"
              name={`factoryPrice${i}`}
              inputMode="decimal"
              aria-label={`Tier ${i + 1} factory price`}
              defaultValue={t?.factoryPrice.toString() ?? ""}
              required={i === 0}
            />
            <span className="text-right text-sm tabular-nums">
              {t ? formatLKR(t.buyerPrice) : ""}
            </span>
          </div>
        ))}
      </fieldset>
    </AdminForm>
  );
}

/** A factory's group deals on one product: the running one, a draft to edit, and past ones. */
export async function DealSection({
  productId,
  factoryId,
}: {
  productId: string;
  factoryId: string;
}) {
  const { deals, defaultEndsAt } = await factoryDeals(factoryId, productId);
  const draft = deals.find((d) => d.status === "DRAFT");
  const running = deals.find((d) => d.status === "LIVE" || d.status === "CLOSED");
  const past = deals.filter((d) => d.status === "SETTLED");
  return (
    <Card data-testid="deal-section">
      <h2 className="mb-3 font-semibold">Group deal</h2>
      {running && (
        <div className="mb-4 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS[running.status].tone}>{STATUS[running.status].label}</Badge>
            <span className="font-semibold tabular-nums" data-testid="deal-sold">
              {running.unitsSold.toLocaleString("en-LK")} sold
            </span>
            {running.unitsHeld > 0 && (
              <span className="text-sm text-subtle">· {running.unitsHeld} paying</span>
            )}
            {running.maxQty !== null && (
              <span className="text-sm text-subtle">
                · of {running.maxQty.toLocaleString("en-LK")}
              </span>
            )}
          </div>
          <p className="text-sm text-subtle">Ends {formatDateTime(running.endsAt)}</p>
          <Tiers deal={running} />
        </div>
      )}
      {draft ? (
        <div className="flex flex-col gap-3">
          <Badge tone="neutral">Draft</Badge>
          <Editor productId={productId} deal={draft} ends={defaultEndsAt} />
          {!running && (
            <AdminForm action={startDealAction} submit="Go live">
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="dealId" value={draft.id} />
            </AdminForm>
          )}
          <AdminForm action={discardDealAction} submit="Discard draft" variant="secondary">
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="dealId" value={draft.id} />
          </AdminForm>
        </div>
      ) : (
        !running && <Editor productId={productId} ends={defaultEndsAt} />
      )}
      {past.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1 text-sm">
          {past.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap justify-between gap-2 border-t border-line pt-1"
            >
              <span>{formatDateTime(d.endsAt)}</span>
              <span className="tabular-nums">
                {d.unitsSold.toLocaleString("en-LK")} sold
                {d.finalTier && ` · ${formatLKR(d.finalTier.buyerPrice)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
