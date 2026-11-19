import { Field, Input } from "@/components/ui";
import { formatLKR } from "@/lib/format";

type Money = { toString(): string };
type Variant = { id: string; size: string; colour: string; available: number };

/** "1 item", "3 items". */
export function itemsLabel(n: number) {
  return `${n} ${n === 1 ? "item" : "items"}`;
}

export const OWN_STATUS: Record<string, string> = {
  OPEN: "Filling",
  LOCKED: "Packing",
  PACKED: "Packed",
  WITH_COURIER: "On the way",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/** One quantity box per size of the product; sizes with no stock are disabled. */
export function SizeQuantities({
  variants,
  price,
  initial = {},
}: {
  variants: Variant[];
  price: Money;
  /** Quantities already in the buyer's cart, by variant id. */
  initial?: Record<string, number>;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-bold">Sizes · {formatLKR(price)} each</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {variants.map((v) => {
          const label = v.colour ? `${v.size} · ${v.colour}` : v.size;
          return (
            <Field key={v.id} label={label} name={`qty-${v.id}`}>
              <Input
                id={`qty-${v.id}`}
                name={`qty-${v.id}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={Math.min(v.available, 99)}
                placeholder="0"
                defaultValue={v.available > 0 ? initial[v.id] || undefined : undefined}
                disabled={v.available === 0}
              />
            </Field>
          );
        })}
      </div>
    </fieldset>
  );
}

export function TokensField() {
  return (
    <Field label="Tokens to use" name="tokens">
      <Input id="tokens" name="tokens" inputMode="decimal" defaultValue="0" />
    </Field>
  );
}
