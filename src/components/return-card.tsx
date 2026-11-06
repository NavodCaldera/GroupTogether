import { Badge, Card, LinkButton } from "./ui";
import type { ReactNode } from "react";
import { ReturnForm } from "./return-form";
import { formatDateTime } from "@/lib/format";
import type { buyerReturns } from "@/server/returns";
export function ReturnCard({
  request: r,
  viewer,
  children,
  threadHref,
}: {
  request: Awaited<ReturnType<typeof buyerReturns>>[number];
  viewer: "buyer" | "factory" | "admin" | "warehouse";
  children?: ReactNode;
  threadHref?: string;
}) {
  const accepted =
    ["ACCEPTED", "PICKED_UP"].includes(r.status) ||
    (viewer === "admin" && r.status === "WITH_ADMIN" && r.adminDecision === true && !r.receivedAt);
  return (
    <Card className="flex min-w-0 flex-col gap-3 break-words">
      <h2 className="font-semibold">
        {r.cartLine.variant.product.title} · {r.cartLine.variant.size} × {r.qty}
      </h2>
      <Badge>
        {viewer === "buyer" && ["WAITING_FACTORY", "WITH_ADMIN"].includes(r.status)
          ? "Waiting for approval"
          : r.status.replaceAll("_", " ").toLowerCase()}
      </Badge>
      {viewer === "admin" && r.status === "WAITING_FACTORY" && (
        <p>Factory due: {formatDateTime(r.factoryDueAt)}</p>
      )}
      {viewer === "buyer" && r.status === "ACCEPTED" && (
        <Badge>
          {r.fault === "BUYER" ? "Send return" : r.pickupRef ? "Pickup booked" : "Pickup pending"}
        </Badge>
      )}
      <p>
        {r.fault === "FACTORY" ? "Factory fault" : "Buyer fault"} ·{" "}
        {r.reason.replaceAll("_", " ").toLowerCase()}
      </p>
      <p>{r.note}</p>
      {r.factoryNote && <p>{r.factoryNote}</p>}
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
      {threadHref && (viewer === "factory" || viewer === "admin") && (
        <LinkButton href={threadHref} variant="secondary">
          Messages
        </LinkButton>
      )}
      {children}
    </Card>
  );
}
