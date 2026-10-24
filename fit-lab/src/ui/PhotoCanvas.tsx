import { useEffect, useRef } from "react";
import type { FrontMeasure, SideMeasure } from "../measure/estimate";
import { BLOCKING, ISSUE_LABEL } from "../measure/quality";
import type { Issue } from "../types";
import type { PhotoAnalysis } from "../vision/analyze";
import { drawAnalysis } from "./overlay";

export function PhotoCanvas({
  photo,
  measure,
}: {
  photo: PhotoAnalysis;
  measure: FrontMeasure | SideMeasure | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawAnalysis(ref.current, photo, measure);
  }, [photo, measure]);
  return <canvas ref={ref} className="photo-canvas" />;
}

export function IssueChips({ issues, extra = [] }: { issues: Issue[]; extra?: string[] }) {
  if (!issues.length && !extra.length) return null;
  return (
    <div className="chips">
      {issues.map((i) => (
        <span key={i} className={`chip ${BLOCKING.includes(i) ? "bad" : ""}`}>
          {ISSUE_LABEL[i]}
        </span>
      ))}
      {extra.map((t) => (
        <span key={t} className="chip bad">
          {t}
        </span>
      ))}
    </div>
  );
}
