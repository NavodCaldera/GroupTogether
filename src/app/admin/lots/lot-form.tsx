import { Field, Input } from "@/components/ui";
import { colomboIsoDay } from "@/lib/format";
import { saveLotAction } from "@/server/lot-actions";
import { AdminForm } from "../admin-form";

type LotValues = {
  id: string;
  name: string;
  pieces: number;
  bulkCost: { toString(): string };
  transportCost: { toString(): string };
  wages: { toString(): string };
  receivedAt: Date;
};

/** A bulk lot: what it cost in all, its pieces and the day it reached our store. */
export function LotForm({ lot }: { lot?: LotValues }) {
  const today = colomboIsoDay();
  return (
    <AdminForm action={saveLotAction} submit={lot ? "Save lot" : "Create lot"}>
      {lot && <input type="hidden" name="id" value={lot.id} />}
      <Field label="Name" name="name">
        <Input name="name" defaultValue={lot?.name} placeholder="e.g. Ekala denim, Oct" required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Pieces" name="pieces">
          <Input
            name="pieces"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            defaultValue={lot?.pieces}
            required
          />
        </Field>
        <Field label="Arrived on" name="receivedOn">
          <Input
            name="receivedOn"
            type="date"
            max={today}
            defaultValue={lot ? colomboIsoDay(lot.receivedAt) : today}
            required
          />
        </Field>
      </div>
      <Field label="Bulk cost (LKR)" name="bulkCost">
        <Input
          name="bulkCost"
          inputMode="decimal"
          defaultValue={lot?.bulkCost.toString()}
          required
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Transport (LKR)" name="transportCost">
          <Input
            name="transportCost"
            inputMode="decimal"
            defaultValue={lot?.transportCost.toString() ?? ""}
          />
        </Field>
        <Field label="Wages (LKR)" name="wages">
          <Input name="wages" inputMode="decimal" defaultValue={lot?.wages.toString() ?? ""} />
        </Field>
      </div>
    </AdminForm>
  );
}
