import type { RatingSummary } from "@/server/ratings";

/** "Factory name ★ 4.6 (12)" under a product; just the name until it has ratings. */
export function FactoryRating({
  factory,
  rating,
  className = "text-xs text-subtle",
}: {
  factory: { name: string; company: string | null } | null;
  rating?: RatingSummary;
  className?: string;
}) {
  if (!factory) return null;
  return (
    <p className={className}>
      {factory.company || factory.name}
      {rating && (
        <span className="ml-1 whitespace-nowrap text-ink">
          <span aria-hidden>★</span> {rating.average.toFixed(1)}
          <span className="text-subtle"> ({rating.count})</span>
          <span className="sr-only"> out of 5 from {rating.count} ratings</span>
        </span>
      )}
    </p>
  );
}
