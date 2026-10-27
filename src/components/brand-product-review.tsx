import Link from "next/link";
import { Card, Badge, Field, Textarea, Select, EmptyState } from "./ui";
import { GiftProductDetails } from "./gift-product-details";
import { BrandRevisionChanges } from "./brand-revision-changes";
import { RewardForm } from "./reward-form";
import { db } from "@/server/db";
import { reviewBrandOfferAction } from "@/server/brand-communication-actions";
import { snapshotTerms } from "@/server/brand-reviews";
import { subjectHref } from "@/server/brand-communications";
import { formatDateTime, formatLKR } from "@/lib/format";
import { discountPct } from "@/lib/brand-rules";
import { BrandSearch, searchValue } from "./brand-inbox";
export async function BrandProductReview({ search }: { search: BrandSearch }) {
  const brand = searchValue(search, "brand");
  const offers = await db.stockOffer.findMany({
    where: {
      seller: { isBrand: true },
      ...(brand ? { sellerId: brand } : {}),
      ...(searchValue(search, "offer") ? { id: searchValue(search, "offer") } : {}),
    },
    include: {
      seller: { select: { company: true, name: true } },
      revisions: { orderBy: { version: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!offers.length) return <EmptyState title="No brand products" />;
  const actorNames = new Map(
    (
      await db.user.findMany({
        where: {
          id: {
            in: offers.flatMap((offer) =>
              offer.revisions.flatMap((revision) => [
                revision.submittedById,
                ...(revision.reviewedById ? [revision.reviewedById] : []),
              ]),
            ),
          },
        },
        select: { id: true, name: true },
      })
    ).map((user) => [user.id, user.name]),
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {offers.map((offer) => {
        const latest = offer.revisions[0];
        const terms = latest ? snapshotTerms(latest.snapshot) : offer;
        const state = latest?.status || offer.status;
        return (
          <Card key={offer.id} className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <p className="text-xs text-subtle">{offer.seller.company || offer.seller.name}</p>
                <h2 className="font-semibold">{terms.name}</h2>
              </div>
              <Badge tone={state === "ACCEPTED" ? "good" : state === "DECLINED" ? "bad" : "info"}>
                {state === "CHANGES_REQUESTED"
                  ? "Changes requested"
                  : state === "IN_REVIEW"
                    ? offer.revision > 1
                      ? "Resubmitted"
                      : "To review"
                    : state === "ACCEPTED"
                      ? "Approved"
                      : "Declined"}
              </Badge>
            </div>
            <GiftProductDetails
              offer={{ ...terms, id: offer.id, photoRevision: latest?.version }}
            />
            {terms.description && (
              <p className="whitespace-pre-wrap break-words text-sm">{terms.description}</p>
            )}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-subtle">Retail value</dt>
                <dd>{formatLKR(terms.actualPrice ?? 0)}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Proposed partner price</dt>
                <dd>
                  {formatLKR(terms.offerPrice ?? 0)}
                  {terms.actualPrice && terms.offerPrice
                    ? ` · ${discountPct(terms.actualPrice, terms.offerPrice)}% off`
                    : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Quantity</dt>
                <dd>{terms.pieces}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Review version</dt>
                <dd>{offer.revision}</dd>
              </div>
            </dl>
            {offer.approvedRevision && (
              <p className="rounded-lg bg-muted p-3 text-sm">
                Live approved price: {formatLKR(offer.offerPrice ?? 0)} · Revision{" "}
                {offer.approvedRevision}
                <br />
                Live campaign quantity: {offer.pieces}. Brand availability controls update this
                separately.
              </p>
            )}
            {terms.productUrl && (
              <a
                href={terms.productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent underline"
              >
                Product on brand website ↗
              </a>
            )}
            <Link
              href={subjectHref(true, "PRODUCT", offer.id, offer.sellerId)}
              className="inline-flex min-h-11 items-center text-sm font-medium text-accent"
            >
              Message brand →
            </Link>
            {state === "IN_REVIEW" && (
              <RewardForm action={reviewBrandOfferAction} submit="Record decision">
                <input type="hidden" name="offerId" value={offer.id} />
                <input type="hidden" name="version" value={offer.revision} />
                <Field label="Decision" name={`decision-${offer.id}`}>
                  <Select id={`decision-${offer.id}`} name="decision" required defaultValue="">
                    <option value="" disabled>
                      Choose decision
                    </option>
                    <option value="approve">Approve</option>
                    <option value="changes">Request changes</option>
                    <option value="decline">Decline</option>
                  </Select>
                </Field>
                <Field label="Reason / message to brand" name={`note-${offer.id}`}>
                  <Textarea id={`note-${offer.id}`} name="note" maxLength={2000} rows={2} />
                </Field>
              </RewardForm>
            )}
            <details>
              <summary className="min-h-11 cursor-pointer text-sm font-medium">
                Revision history ({offer.revisions.length})
              </summary>
              <ol className="mt-2 flex flex-col gap-3">
                {offer.revisions.map((revision, index) => {
                  const saved = snapshotTerms(revision.snapshot);
                  return (
                    <li key={revision.id} className="rounded-lg border border-line p-3 text-sm">
                      <p className="font-medium">
                        Revision {revision.version} ·{" "}
                        {revision.supersededAt
                          ? "Replaced by newer submission"
                          : revision.status.replaceAll("_", " ")}
                      </p>
                      <p>
                        {formatLKR(saved.offerPrice ?? 0)} · {saved.pieces} gifts
                      </p>
                      <p className="text-xs text-subtle">
                        Submitted {formatDateTime(revision.createdAt)} ·{" "}
                        {actorNames.get(revision.submittedById) || "Legacy account"}
                      </p>
                      {revision.reviewedAt && (
                        <p className="text-xs text-subtle">
                          Reviewed {formatDateTime(revision.reviewedAt)} ·{" "}
                          {revision.reviewedById
                            ? actorNames.get(revision.reviewedById)
                            : "Legacy review"}
                        </p>
                      )}
                      <GiftProductDetails
                        offer={{ ...saved, id: offer.id, photoRevision: revision.version }}
                      />
                      <BrandRevisionChanges
                        current={saved}
                        previous={
                          offer.revisions[index + 1]
                            ? snapshotTerms(offer.revisions[index + 1].snapshot)
                            : undefined
                        }
                      />
                    </li>
                  );
                })}
              </ol>
            </details>
          </Card>
        );
      })}
    </div>
  );
}
