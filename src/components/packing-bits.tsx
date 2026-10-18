import { CHECKS_NEEDED, namesList } from "@/lib/packing-rules";
import { formatDateTime } from "@/lib/format";
import { cx } from "./ui";

/** What the packing pages and the admin need to show who packed, checked and handed over. */
export type PackingTrailView = {
  packedAt: Date;
  handedOverAt: Date | null;
  packedBy: { name: string };
  handedOverBy: { name: string } | null;
  checks: { userId: string; createdAt: Date; user: { name: string } }[];
} | null;

/** "Checked by Amal and Nimal", or null before anyone has checked it. */
export function checkedByText(p: PackingTrailView): string | null {
  if (!p || p.checks.length === 0) return null;
  return `Checked by ${namesList(p.checks.map((c) => c.user.name))}`;
}

/** Packed by, each check, and the PickMe handover, with times. "You" marks the viewer's own steps. */
export function PackingTrail({
  packing,
  you,
  className,
}: {
  packing: PackingTrailView;
  you?: string;
  className?: string;
}) {
  if (!packing) return <p className={cx("text-sm text-subtle", className)}>Not packed yet.</p>;
  const missing = CHECKS_NEEDED - packing.checks.length;
  const rows = [
    { text: `Packed by ${packing.packedBy.name}`, at: packing.packedAt, done: true },
    ...packing.checks.map((c) => ({
      text: `Checked by ${c.user.name}${c.userId === you ? " (you)" : ""}`,
      at: c.createdAt,
      done: true,
    })),
    ...Array.from({ length: Math.max(0, missing) }, () => ({
      text: "Waiting for a check",
      at: null,
      done: false,
    })),
    packing.handedOverAt && packing.handedOverBy
      ? {
          text: `Handed to PickMe by ${packing.handedOverBy.name}`,
          at: packing.handedOverAt,
          done: true,
        }
      : { text: "Not handed to PickMe yet", at: null, done: false },
  ];
  return (
    <ol className={cx("flex flex-col gap-1.5 text-sm", className)}>
      {rows.map((r, i) => (
        <li key={i} className={cx("flex items-start gap-2", !r.done && "text-subtle")}>
          <span aria-hidden className={cx("mt-0.5 shrink-0", r.done && "text-accent")}>
            {r.done ? "✓" : "○"}
          </span>
          <span>
            {r.text}
            {r.at && <span className="block text-xs text-subtle">{formatDateTime(r.at)}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** One line for admin lists: where packing is, naming who certified the order. */
export function packingSummary(p: PackingTrailView): string {
  if (!p) return "Not packed yet";
  const names = namesList(p.checks.map((c) => c.user.name));
  if (p.checks.length < CHECKS_NEEDED)
    return `Packed by ${p.packedBy.name} · ${p.checks.length} of ${CHECKS_NEEDED} checks${names ? ` (${names})` : ""}`;
  const checked = `Checked by ${names}`;
  return p.handedOverBy ? `${checked} · handed to PickMe by ${p.handedOverBy.name}` : checked;
}
