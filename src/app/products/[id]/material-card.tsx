import { MaterialCardView, type Why } from "@/components/materials/material-card-view";
import { Card } from "@/components/ui";
import type { MaterialCard } from "@/lib/materials/card";

/** The product page's Material Card (DEC-022) */
export function MaterialSection({
  card,
  why,
  productId,
}: {
  card: MaterialCard;
  why: Why | null;
  productId: string;
}) {
  return (
    <Card>
      <MaterialCardView card={card} why={why} compareHref={`/products/${productId}/compare`} />
    </Card>
  );
}
