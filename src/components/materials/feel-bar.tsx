import { AXIS_TEXT } from "@/lib/materials/card";
import type { AxisResult } from "@/lib/materials/types";

/**
 * One read-only feel slider (DEC-022): a dot for a measured or declared point, a translucent bar
 * for an estimated band, a dashed track when not measured. The sentence beside it is the value
 * for screen readers; the drawing is hidden from them.
 */
export function FeelBar({
  axis,
  text,
  showText = false,
}: {
  axis: AxisResult;
  text: string;
  /** Show the sentence under the bar (admin) instead of only to screen readers */
  showText?: boolean;
}) {
  const t = AXIS_TEXT[axis.axis];
  const point = axis.basis === "MEASURED" || axis.basis === "DECLARED" ? axis.value : null;
  const band = axis.basis === "ESTIMATED" ? axis.band : null;
  const none = point == null && !band;
  return (
    <div className="flex flex-col gap-1">
      {!showText && <p className="sr-only">{text}</p>}
      <div aria-hidden className="flex items-center justify-between text-xs text-subtle">
        <span>{t.left}</span>
        {none && <span>Not yet measured</span>}
        {band && <span>estimate</span>}
        <span>{t.right}</span>
      </div>
      <div
        aria-hidden
        className={
          none
            ? "relative h-2 rounded-full border border-dashed border-line"
            : "relative h-2 rounded-full bg-muted"
        }
      >
        {band && (
          <span
            className="absolute inset-y-0 rounded-full bg-accent/40"
            style={{ left: `${band[0]}%`, width: `${Math.max(band[1] - band[0], 2)}%` }}
          />
        )}
        {point != null && (
          <span
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-ink"
            style={{ left: `${point}%` }}
          />
        )}
      </div>
      {showText && <p className="text-xs text-subtle">{text}</p>}
    </div>
  );
}
