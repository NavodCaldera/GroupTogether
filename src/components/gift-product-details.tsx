import { formatDate } from "@/lib/format";

export function GiftProductDetails({
  offer,
}: {
  offer: {
    id: string;
    photoRevision?: number;
    name: string;
    photoKey?: string | null;
    packDetails?: string | null;
    packSize?: string | null;
    dispatchDays?: number | null;
    hasExpiry?: boolean;
    expiryDate?: Date | null;
    minShelfLifeDays?: number | null;
  };
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {offer.photoKey && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/brand-photos/${offer.id}${offer.photoRevision ? `?revision=${offer.photoRevision}` : ""}`}
          alt={offer.name}
          width={240}
          height={180}
          loading="lazy"
          className="h-44 w-full rounded-lg bg-muted object-contain"
        />
      )}
      {(offer.packDetails || offer.packSize || offer.dispatchDays || offer.hasExpiry) && (
        <dl className="grid gap-2 text-sm">
          {offer.packDetails && (
            <div>
              <dt className="text-xs text-subtle">Gift contents</dt>
              <dd className="whitespace-pre-line break-words">{offer.packDetails}</dd>
            </div>
          )}
          {offer.packSize && (
            <div>
              <dt className="text-xs text-subtle">Size / weight / volume</dt>
              <dd>{offer.packSize}</dd>
            </div>
          )}
          {offer.dispatchDays && (
            <div>
              <dt className="text-xs text-subtle">Dispatch after payment approval</dt>
              <dd>
                Within {offer.dispatchDays} business {offer.dispatchDays === 1 ? "day" : "days"}
              </dd>
            </div>
          )}
          {offer.hasExpiry && offer.expiryDate && (
            <div>
              <dt className="text-xs text-subtle">Expiry date</dt>
              <dd>{formatDate(offer.expiryDate)}</dd>
            </div>
          )}
          {offer.hasExpiry && offer.minShelfLifeDays && (
            <div>
              <dt className="text-xs text-subtle">Shelf life on delivery</dt>
              <dd>At least {offer.minShelfLifeDays} days remaining</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
