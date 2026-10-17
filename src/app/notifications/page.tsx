import type { Metadata } from "next";
import { Alert, Button, EmptyState, PageHeader } from "@/components/ui";
import { cartTotal } from "@/lib/cart-rules";
import { formatDateTime, formatLKR } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { acceptMergeAction, declineMergeAction, markAllReadAction } from "@/server/carts/actions";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Notifications" };

const JOIN = " wants to join your cart";

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const user = await requireUser([], "/notifications");
  const sp = await searchParams;
  const items = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Join requests can be answered right here. Newer notices carry the request id; older ones
  // are matched by cart and requester name.
  const ids = items
    .map((n) =>
      n.href?.includes("?") ? new URLSearchParams(n.href.split("?")[1]).get("request") : null,
    )
    .filter((x): x is string => !!x);
  const requests = await db.cartMergeRequest.findMany({
    where: { toCart: { ownerId: user.id }, OR: [{ id: { in: ids } }, { status: "PENDING" }] },
    include: {
      user: { select: { name: true } },
      toCart: { select: { code: true } },
    },
  });
  const brings = new Map(
    await Promise.all(
      requests
        .filter((r) => r.status === "PENDING" && r.fromCartId)
        .map(async (r) => {
          const lines = await db.cartLine.findMany({
            where: { cartId: r.fromCartId!, userId: r.userId },
            select: { qty: true, unitPrice: true },
          });
          return [r.id, cartTotal(lines)] as const;
        }),
    ),
  );
  const requestFor = (href: string | null, title: string) => {
    if (!href) return undefined;
    const id = href.includes("?") ? new URLSearchParams(href.split("?")[1]).get("request") : null;
    if (id) return requests.find((r) => r.id === id);
    if (!title.endsWith(JOIN) || !href.startsWith("/c/")) return undefined;
    const code = href.slice(3).split("?")[0];
    const name = title.slice(0, -JOIN.length);
    return requests.find(
      (r) => r.status === "PENDING" && r.toCart.code === code && r.user.name === name,
    );
  };
  const decided = { ACCEPTED: "You accepted", DECLINED: "You declined", CANCELLED: "Withdrawn" };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title="Notifications"
        actions={
          items.some((n) => !n.readAt) && (
            <form action={markAllReadAction}>
              <Button variant="secondary">Mark all read</Button>
            </form>
          )
        }
      />
      {sp.done === "accepted" && (
        <div className="mb-4">
          <Alert tone="good">Accepted. Their items are now in your cart.</Alert>
        </div>
      )}
      {sp.done === "declined" && (
        <div className="mb-4">
          <Alert tone="info">Declined. Their cart stays as it was.</Alert>
        </div>
      )}
      {typeof sp.error === "string" && (
        <div className="mb-4">
          <Alert>{sp.error}</Alert>
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState title="Nothing yet" />
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {items.map((n) => {
            const req = requestFor(n.href, n.title);
            const body = (
              <>
                <p className={n.readAt ? "font-medium" : "font-semibold"}>
                  {!n.readAt && (
                    <span className="mr-2 inline-block size-2 rounded-full bg-accent" />
                  )}
                  {n.title}
                </p>
                <p className="mt-0.5 text-sm text-subtle">{n.body}</p>
                <p className="mt-1 text-xs text-subtle">{formatDateTime(n.createdAt)}</p>
              </>
            );
            return (
              <li key={n.id}>
                {n.href ? (
                  // Plain <a>: the route marks it read on click; Link would prefetch it.
                  <a href={`/notifications/${n.id}`} className="block p-4 hover:bg-muted">
                    {body}
                  </a>
                ) : (
                  <div className="p-4">{body}</div>
                )}
                {req?.status === "PENDING" && (
                  <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
                    {brings.has(req.id) && (
                      <p className="mr-auto text-sm">
                        Brings <strong>{formatLKR(brings.get(req.id)!)}</strong>
                      </p>
                    )}
                    <form action={acceptMergeAction}>
                      <input type="hidden" name="requestId" value={req.id} />
                      <input type="hidden" name="back" value="/notifications" />
                      <input type="hidden" name="verdict" value="accepted" />
                      <Button>Accept</Button>
                    </form>
                    <form action={declineMergeAction}>
                      <input type="hidden" name="requestId" value={req.id} />
                      <input type="hidden" name="back" value="/notifications" />
                      <input type="hidden" name="verdict" value="declined" />
                      <Button variant="secondary">Decline</Button>
                    </form>
                  </div>
                )}
                {req && req.status !== "PENDING" && (
                  <p className="px-4 pb-4 text-sm text-subtle">{decided[req.status]}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
