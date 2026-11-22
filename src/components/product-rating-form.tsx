"use client";
import { useActionState, useState } from "react";
import { Alert, Button, Input } from "./ui";

type RatingState = { error?: string };
import {
  photoRequired,
  REPORT_REASONS,
  REPORT_REASON_LABEL,
  type ReportReason,
} from "@/lib/quality-rules";
export function ProductRatingForm({
  orderId,
  productId,
  title,
  rateAction,
  reasons = REPORT_REASONS,
}: {
  orderId: string;
  productId: string;
  title: string;
  rateAction: (previous: RatingState, fd: FormData) => Promise<RatingState>;
  /** Report reasons for this product's category */
  reasons?: readonly ReportReason[];
}) {
  const [state, action, pending] = useActionState<RatingState, FormData>(rateAction, {});
  const [stars, setStars] = useState("5"),
    [reason, setReason] = useState("");
  const id = `rating-${productId}`;
  return (
    <form action={action} className="flex min-w-0 flex-col gap-3 border-t border-line pt-3">
      <h3 className="font-semibold">{title}</h3>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="productId" value={productId} />
      <label htmlFor={`${id}-stars`}>Stars</label>
      <select
        id={`${id}-stars`}
        name="stars"
        value={stars}
        onChange={(e) => setStars(e.target.value)}
        className="min-h-11 rounded-lg border border-line bg-paper px-3 text-base"
      >
        {[5, 4, 3, 2, 1].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-reason`}>Report reason</label>
      <select
        id={`${id}-reason`}
        name="reason"
        required={Number(stars) <= 2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="min-h-11 rounded-lg border border-line bg-paper px-3 text-base"
      >
        <option value="">None</option>
        {reasons.map((r) => (
          <option key={r} value={r}>
            {REPORT_REASON_LABEL[r]}
          </option>
        ))}
      </select>
      {reason && (
        <>
          <label htmlFor={`${id}-note`}>Report note</label>
          <Input id={`${id}-note`} name="note" maxLength={2000} />
          <label htmlFor={`${id}-photos`}>Report photos</label>
          <input
            id={`${id}-photos`}
            name="photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            required={photoRequired(reason as ReportReason)}
            className="max-w-full text-base"
          />
        </>
      )}
      <Button disabled={pending}>Save rating</Button>
      {state.error && <Alert>{state.error}</Alert>}
    </form>
  );
}
