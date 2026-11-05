import { Badge, Card } from "./ui";
import { ReturnForm } from "./return-form";
import type { buyerReturns } from "@/server/returns";
export function ReturnCard({
  request: r,
  viewer,
}: {
  request: Awaited<ReturnType<typeof buyerReturns>>[number];
  viewer: "buyer" | "factory" | "admin" | "warehouse";
}) {
  const accepted =
    ["ACCEPTED", "PICKED_UP"].includes(r.status) ||
    (r.status === "WITH_ADMIN" && r.adminDecision === true);
  return (
    <Card className="flex min-w-0 flex-col gap-3 break-words">
      <h2 className="font-semibold">
        {r.cartLine.variant.product.title} · {r.cartLine.variant.size} × {r.qty}
      </h2>
      <Badge>{r.status.replaceAll("_", " ").toLowerCase()}</Badge>
      <p>
        {r.fault === "FACTORY" ? "Factory fault" : "Buyer fault"} ·{" "}
        {r.reason.replaceAll("_", " ").toLowerCase()}
      </p>
      <p>{r.note}</p>
      {r.adminNote && <p>{r.adminNote}</p>}
      {r.receivedCondition && <p>{r.receivedCondition}</p>}
      {viewer !== "warehouse" && (
        <div className="flex flex-wrap gap-3">
          {r.photos.map((p, i) => (
            <a
              className="underline"
              key={p.id}
              href={`/api/return-photos/${p.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Return photo {i + 1}
            </a>
          ))}
        </div>
      )}
      {r.pickupRef && (
        <p>
          PickMe: {r.pickupRef} · {r.pickupDriver} · Factory pays
        </p>
      )}
      {viewer === "buyer" &&
        r.status === "REJECTED" &&
        r.adminDecision === null &&
        !r.escalatedAt && <ReturnForm id={r.id} op="escalate" />}
      {viewer === "factory" && r.status === "WAITING_FACTORY" && (
        <ReturnForm id={r.id} op="factory" />
      )}
      {viewer === "admin" && r.status === "WITH_ADMIN" && r.adminDecision === null && (
        <ReturnForm id={r.id} op="admin" />
      )}
      {(viewer === "factory" || viewer === "admin") && accepted && (
        <ReturnForm id={r.id} op="received" buyerFault={r.fault === "BUYER"} />
      )}
      {(viewer === "admin" || viewer === "warehouse") &&
        (r.status === "ACCEPTED" ||
          (viewer === "admin" && r.status === "WITH_ADMIN" && r.adminDecision === true)) &&
        r.fault === "FACTORY" &&
        !r.pickupRef && <ReturnForm id={r.id} op="pickup" />}
      {viewer === "admin" && r.status === "ACCEPTED" && r.pickupRef && (
        <ReturnForm id={r.id} op="picked-up" />
      )}
    </Card>
  );
}
