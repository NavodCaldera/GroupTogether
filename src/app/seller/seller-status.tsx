import type { ProductStatus } from "@/components/cart-bits";
import { Badge } from "@/components/ui";

/** The seller's words for where a product is (product owner, 2026-10-19): no back-office terms. */
export function sellerStatus(status: ProductStatus, reviewNote: string | null) {
  if (status === "DRAFT" && reviewNote) return { label: "Needs changes", tone: "bad" } as const;
  if (status === "DRAFT") return { label: "Draft", tone: "neutral" } as const;
  if (status === "IN_REVIEW") return { label: "Waiting for your stock", tone: "info" } as const;
  if (status === "LIVE") return { label: "On sale", tone: "good" } as const;
  return { label: "Ended", tone: "neutral" } as const;
}

export function SellerStatusBadge({
  status,
  reviewNote,
}: {
  status: ProductStatus;
  reviewNote: string | null;
}) {
  const s = sellerStatus(status, reviewNote);
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
