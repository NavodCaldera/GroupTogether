import { Field, Input } from "@/components/ui";

/** "1 item", "3 items". */
export function itemsLabel(n: number) {
  return `${n} ${n === 1 ? "item" : "items"}`;
}

export const OWN_STATUS: Record<string, string> = {
  OPEN: "Filling",
  LOCKED: "Packing",
  PACKED: "Packing",
  WITH_COURIER: "On the way",
  DELIVERED: "Delivered",
  CANCELLED: "Refunded",
};

export const OWN_STEPS = ["Filling", "Packing", "On the way", "Delivered"] as const;

/** The own basket's step on the tracker; null once it is delivered or cancelled. */
export function ownStep(status: string): number | null {
  switch (status) {
    case "OPEN":
      return 0;
    case "LOCKED":
    case "PACKED":
      return 1;
    case "WITH_COURIER":
      return 2;
    default:
      return null;
  }
}

export function TokensField() {
  return (
    <Field label="Tokens to use" name="tokens">
      <Input id="tokens" name="tokens" inputMode="decimal" defaultValue="0" />
    </Field>
  );
}
