import { Badge, Card, LinkButton } from "./ui";
import type { ReactNode } from "react";
import { ReturnForm } from "./return-form";
import { formatDateTime, formatLKR } from "@/lib/format";
import { BUYER_FAULT_LABEL, returnStatusLabel } from "@/lib/return-rules";
import { toD } from "@/lib/decimal";
import type { buyerReturns } from "@/server/returns";
export function ReturnCard({
  request: r,
  viewer,
  children,
  threadHref,
  canChangeFault = false,
}: {
  request: Awaited<ReturnType<typeof buyerReturns>>[number];
  viewer: "buyer" | "factory" | "admin" | "agents";
  children?: ReactNode;
  threadHref?: string;
  /** Factory admins may change a factory-fault return to buyer fault */
  canChangeFault?: boolean;
}) {
  const item = r.orderLine?.variant;
  const agent = r.handoverAgent;
  return (
    <Card className="flex min-w-0 flex-col gap-3 break-words">
      <h2 className="font-semibold">
        {item ? `${item.product.title} · ${item.size} × ${r.qty}` : `× ${r.qty}`}
      </h2>
      <Badge tone={["REJECTED", "LAPSED"].includes(r.status) ? "bad" : undefined}>
        {returnStatusLabel(r.status, r.fault)}
      </Badge>
      {viewer === "admin" && r.status === "WAITING_FACTORY" && (
        <p>Factory due: {formatDateTime(r.factoryDueAt)}</p>
      )}
      {r.status === "AWAITING_HANDOVER" && agent && (
        <p>
          {agent.user.name} · {[agent.address, agent.city].filter(Boolean).join(", ")}
          {r.handoverDueAt && <> · {formatDateTime(r.handoverDueAt)}</>}
        </p>
      )}
      <p>
        {r.fault === "FACTORY" ? "Factory fault" : "Buyer fault"} ·{" "}
        {r.buyerReason
          ? BUYER_FAULT_LABEL[r.buyerReason]
          : (r.reason ?? "OTHER").replaceAll("_", " ").toLowerCase()}
      </p>
      {r.fault === "BUYER" && r.orderLine && (
        <p>Buyer gets {formatLKR(toD(r.orderLine.factoryPrice).times(r.qty))} if it sells</p>
      )}
      <p>{r.note}</p>
      {r.factoryNote && <p>{r.factoryNote}</p>}
      {r.adminNote && <p>{r.adminNote}</p>}
      {r.receivedCondition && <p>{r.receivedCondition}</p>}
      {(viewer !== "agents" || r.fault === "BUYER") && (
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
      {viewer === "factory" && r.status === "WAITING_FACTORY" && (
        <ReturnForm id={r.id} op="factory" />
      )}
      {viewer === "admin" &&
        r.status === "WITH_ADMIN" &&
        r.fault === "FACTORY" &&
        r.adminDecision === null && (
          <>
            <ReturnForm id={r.id} op="admin" />
            {canChangeFault && <ReturnForm id={r.id} op="change-to-buyer" />}
          </>
        )}
      {viewer === "agents" && r.status === "BUYER_REQUESTED" && (
        <ReturnForm id={r.id} op="buyer-decide" />
      )}
      {(viewer === "factory" || viewer === "admin") && r.status === "PICKED_UP" && (
        <ReturnForm id={r.id} op="received" />
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
