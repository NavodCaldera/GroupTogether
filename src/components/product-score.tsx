import type { RatingSummary } from "@/server/ratings";
export function ProductScore({ score }: { score?: RatingSummary }) {
  return (
    <p className="text-xs text-subtle">
      Product: {score ? `${score.average.toFixed(1)} / 5 (${score.count})` : "No ratings"}
    </p>
  );
}
