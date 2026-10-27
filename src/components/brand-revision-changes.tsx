import type { Snapshot } from "@/server/brand-reviews";
import { formatDate, formatLKR } from "@/lib/format";
const fields = [
  ["name", "Product name"],
  ["description", "Description"],
  ["actualPrice", "Retail value"],
  ["offerPrice", "Partner price"],
  ["pieces", "Submitted quantity"],
  ["packDetails", "Gift contents"],
  ["packSize", "Size / weight / volume"],
  ["dispatchDays", "Dispatch business days"],
  ["hasExpiry", "Has expiry"],
  ["expiryDate", "Expiry date"],
  ["minShelfLifeDays", "Minimum shelf life (days)"],
  ["productUrl", "Product link"],
] as const;
function value(terms: Snapshot, key: (typeof fields)[number][0]) {
  const raw = terms[key];
  if (raw === null || raw === "") return "Not specified";
  if (key === "actualPrice" || key === "offerPrice") return formatLKR(String(raw));
  if (raw instanceof Date) return formatDate(raw);
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  return String(raw);
}
export function BrandRevisionChanges({
  current,
  previous,
}: {
  current: Snapshot;
  previous?: Snapshot;
}) {
  const changed = fields.filter(
    ([key]) => !previous || value(previous, key) !== value(current, key),
  );
  const photoChanged = !!previous && current.photoKey !== previous.photoKey;
  return (
    <details className="mt-3">
      <summary className="min-h-11 cursor-pointer text-sm font-medium">
        {previous ? "Compare with previous submission" : "Full submitted terms"}
      </summary>
      <dl className="space-y-3 text-sm">
        {changed.map(([key, label]) => (
          <div key={key} className="border-t border-line pt-2">
            <dt className="font-medium">{label}</dt>
            <dd className="mt-1 grid min-w-0 gap-2 sm:grid-cols-2">
              {previous && (
                <div className="min-w-0">
                  <p className="text-xs text-subtle">Previous</p>
                  <p className="whitespace-pre-wrap break-words">{value(previous, key)}</p>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs text-subtle">Submitted</p>
                <p className="whitespace-pre-wrap break-words">{value(current, key)}</p>
              </div>
            </dd>
          </div>
        ))}
      </dl>
      {photoChanged && <p className="mt-2 text-sm">Photo replaced in this submission.</p>}
      {!changed.length && !photoChanged && (
        <p className="text-sm text-subtle">Terms unchanged; resubmitted for review.</p>
      )}
    </details>
  );
}
