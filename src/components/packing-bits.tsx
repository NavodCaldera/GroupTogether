import { formatDateTime } from "@/lib/format";
import { cx } from "./ui";

/** Who checked and gathered, rechecked and packed, and handed over (CLAUDE.md rule 17). */
export type PackingTrailView = {
  gatheredAt: Date;
  packedAt: Date | null;
  handedOverAt: Date | null;
  gatheredBy: { id: string; name: string };
  packedBy: { id: string; name: string } | null;
  handedOverBy: { id: string; name: string } | null;
} | null;

/**
 * The two checks and the PickMe handover, with times. "You" marks the viewer's own steps.
 * `brief` (packing staff) shows only the steps done, without times.
 */
export function PackingTrail({
  packing,
  you,
  brief,
  className,
}: {
  packing: PackingTrailView;
  you?: string;
  brief?: boolean;
  className?: string;
}) {
  if (!packing)
    return brief ? null : <p className={cx("text-sm text-subtle", className)}>Not gathered yet.</p>;
  const me = (u: { id: string } | null) => (u && u.id === you ? " (you)" : "");
  const rows = [
    {
      text: `Checked and gathered by ${packing.gatheredBy.name}${me(packing.gatheredBy)}`,
      at: packing.gatheredAt,
      done: true,
    },
    packing.packedAt && packing.packedBy
      ? {
          text: `Rechecked and packed by ${packing.packedBy.name}${me(packing.packedBy)}`,
          at: packing.packedAt,
          done: true,
        }
      : { text: "Not packed yet", at: null, done: false },
    packing.handedOverAt && packing.handedOverBy
      ? {
          text: `Handed to PickMe by ${packing.handedOverBy.name}${me(packing.handedOverBy)}`,
          at: packing.handedOverAt,
          done: true,
        }
      : { text: "Not handed to PickMe yet", at: null, done: false },
  ].filter((r) => !brief || r.done);
  return (
    <ol className={cx("flex flex-col gap-1.5 text-sm", className)}>
      {rows.map((r, i) => (
        <li key={i} className={cx("flex items-start gap-2", !r.done && "text-subtle")}>
          <span aria-hidden className={cx("mt-0.5 shrink-0", r.done && "text-accent")}>
            {r.done ? "✓" : "○"}
          </span>
          <span>
            {r.text}
            {r.at && !brief && (
              <span className="block text-xs text-subtle">{formatDateTime(r.at)}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
