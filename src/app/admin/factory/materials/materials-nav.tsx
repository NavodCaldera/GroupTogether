import { Chip, ChipRow } from "@/app/admin/list-bits";

const VIEWS = [
  ["/admin/factory/materials", "Materials"],
  ["/admin/factory/materials/reports", "Reports"],
  ["/admin/factory/materials/library?view=sources", "Sources"],
  ["/admin/factory/materials/library?view=evidence", "Evidence"],
  ["/admin/factory/materials/library?view=rules", "Rules"],
  ["/admin/factory/materials/library?view=labs", "Labs"],
  ["/admin/factory/materials/library?view=calibration", "Calibration"],
] as const;

/** The Materials area's own views (DEC-022) */
export function MaterialsNav({ active }: { active: string }) {
  return (
    <ChipRow>
      {VIEWS.map(([href, label]) => (
        <Chip key={href} href={href} active={label === active}>
          {label}
        </Chip>
      ))}
    </ChipRow>
  );
}
