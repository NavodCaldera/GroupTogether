import { Badge } from "@/components/ui";
import type { LineState } from "@/server/orders/buyer";

export function LineBadge({ state }: { state: LineState }) {
  return (
    <Badge
      tone={
        state === "Cancelled"
          ? "bad"
          : state === "Collected" || state === "Received"
            ? "good"
            : state === "Paid"
              ? "info"
              : "neutral"
      }
    >
      {state}
    </Badge>
  );
}

export const factoryName = (f: { name: string; company: string | null }) => f.company || f.name;
