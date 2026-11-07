import type { listHoldMessages, factoryFaults } from "@/server/fault-holds";
import { formatDateTime } from "@/lib/format";
import { FaultForm } from "./fault-form";
import { Badge, LinkButton } from "./ui";
export function HoldThread({
  id,
  messages,
  canPost,
}: {
  id: string;
  messages: Awaited<ReturnType<typeof listHoldMessages>>;
  canPost: boolean;
}) {
  return (
    <section
      aria-label="Hold messages"
      className="flex min-w-0 flex-col gap-3 border-t border-line pt-3"
    >
      <h3 className="font-semibold">Messages</h3>
      <ol className="flex min-w-0 flex-col gap-3">
        {messages.map((m) => (
          <li key={m.id} className="min-w-0 break-words">
            <p className="font-semibold">{m.author.name}</p>
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>
            <time className="text-sm text-subtle">{formatDateTime(m.createdAt)}</time>
          </li>
        ))}
      </ol>
      {canPost && <FaultForm id={id} op="message" />}
    </section>
  );
}
export function FaultList({
  faults,
  admin = false,
}: {
  faults: Awaited<ReturnType<typeof factoryFaults>>["faults"];
  admin?: boolean;
}) {
  return (
    <ul className="flex min-w-0 flex-col gap-3">
      {faults.map((f) => (
        <li
          key={f.id}
          className="flex min-w-0 flex-col gap-2 border-t border-line pt-3 break-words"
        >
          {f.request.orderLine && (
            <p>
              {f.request.orderLine.variant.product.title} · {f.request.orderLine.variant.size} ×{" "}
              {f.units}
            </p>
          )}
          <time>{formatDateTime(f.recordedAt)}</time>
          {f.cancelledAt && (
            <>
              <Badge>Cancelled fault</Badge>
              <p>{f.cancelNote}</p>
            </>
          )}
          <LinkButton
            variant="secondary"
            href={
              admin
                ? `/admin/factory/returns/${f.returnId}`
                : `/seller/returns?return=${f.returnId}`
            }
          >
            Return
          </LinkButton>
          {admin && !f.cancelledAt && <FaultForm id={f.id} op="cancel" />}
        </li>
      ))}
    </ul>
  );
}
