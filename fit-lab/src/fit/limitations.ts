import { BODY_LABEL } from "../labels";
import { BODY_FOR } from "./ease";
import type { Recommendation } from "./predict";

export function limitations(rec: Recommendation): string[] {
  const out: string[] = [];
  const used = (rec.best?.dims ?? []).filter((d) => d.body);
  const fromPhoto = used.filter((d) => d.body!.source === "photo");
  if (fromPhoto.length) {
    const worst = Math.max(...fromPhoto.map((d) => 2 * d.body!.sd));
    out.push(`Photo estimates ±${Math.round(worst)} cm`);
    out.push("Clothes worn in the photos add to the estimates");
  }
  for (const k of rec.missing) out.push(`No ${BODY_LABEL[BODY_FOR[k]].toLowerCase()} measurement`);
  for (const d of used) {
    const e = d.body!;
    if (e.mismatch && e.photo !== undefined) {
      out.push(
        `${BODY_LABEL[BODY_FOR[d.key]]}: typed ${Math.round(e.value)} cm, photo ${Math.round(e.photo)} cm`,
      );
    }
  }
  const joints = used.filter((d) => d.body!.source === "photo" && d.body!.method === "joints");
  if (joints.length) {
    const names = joints.map((d) => BODY_LABEL[BODY_FOR[d.key]]).join(", ");
    out.push(`${names} from joint positions, not validated`);
  }
  if (rec.garment.sample) out.push("Sample size chart");
  if (rec.garment.fabric.stretchPct > 0)
    out.push(`Stretch counted: ${rec.garment.fabric.stretchPct}%`);
  out.push("An estimate, not a guaranteed fit");
  return out;
}
