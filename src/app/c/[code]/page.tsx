import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StatusBadge } from "@/components/cart-bits";
import { BackLink, Countdown } from "@/components/client";
import { Toast } from "@/components/toast";
import { Alert, Badge, Button, Card, LinkButton } from "@/components/ui";
import {
  cartTotal,
  isEditable,
  lineTotal,
  mergeBlockReason,
  progress,
  remaining,
} from "@/lib/cart-rules";
import { formatLKR } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import {
  acceptMergeAction,
  cancelAction,
  cancelMergeAction,
  declineMergeAction,
  leaveAction,
  requestMergeAction,
  updateLineAction,
} from "@/server/carts/actions";
import {
  type FullCart,
  activeCartDetail,
  cartByCode,
  mergeRequestsFor,
  myMergeRequest,
} from "@/server/carts/queries";
import { sweep } from "@/server/carts/service";
import { conversationHref, listMessages, threadsFor } from "@/server/carts/chat";
import { ChatPanel } from "./chat";
import { AcceptForm, JoinForm } from "./cart-forms";

export async function generateMetadata({ params }: PageProps<"/c/[code]">): Promise<Metadata> {
  const { code } = await params;
  return { title: `Group cart ${code.toUpperCase()}` };
}

export default async function CartPage({ params, searchParams }: PageProps<"/c/[code]">) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const found = await cartByCode(code);
  if (!found) notFound();
  // Apply any deadline that passed before showing the cart.
  const swept = await sweep(new Date(), found.id);
  const cart = swept.closed ? (await cartByCode(code))! : found;
  const user = await getCurrentUser();
  if (user?.role === "SELLER") redirect("/seller");

  const isOwner = user?.id === cart.ownerId;
  const isMember = !!user && cart.members.some((m) => m.userId === user.id);
  const editable = isEditable(cart.status);
  const title = cart.name || `${cart.owner.name}'s group cart`;
  const slip = cart.slips[0];
  const pct = progress(cart.total.toString(), cart.minOrderValue.toString());
  const toGo = remaining(cart.total.toString(), cart.minOrderValue.toString());

  // Someone already in another cart can ask to merge into this one; its owner decides.
  const now = new Date();
  const mine = user && !isMember && editable ? await activeCartDetail(user.id, now) : null;
  const merge =
    user && mine
      ? {
          from: mine,
          request: await myMergeRequest(user.id, cart.id),
          reason: mergeBlockReason(
            {
              from: { ...mine, memberCount: mine._count.members },
              to: cart,
              userId: user.id,
            },
            now,
          ),
        }
      : null;

  // Chat with the owner. The owner has an inbox of people who wrote; everyone else one thread.
  const threads = user && isOwner ? await threadsFor(cart.id) : [];
  const chatWith =
    user && isOwner
      ? typeof sp.chat === "string" && threads.some((t) => t.participantId === sp.chat)
        ? sp.chat
        : threads[0]?.participantId
      : undefined;
  const chatMessages =
    user && (!isOwner || chatWith)
      ? (await listMessages(user.id, cart.id, chatWith)).map((m) => ({
          ...m,
          createdAt: m.createdAt.toISOString(),
        }))
      : [];
  const chatName = isOwner
    ? (threads.find((t) => t.participantId === chatWith)?.name ?? "")
    : cart.owner.name;
  const joinRequests = isOwner && editable ? await mergeRequestsFor(cart.id) : [];

  return (
    // One column, read top to bottom: what it is, how far along, your next step, who is in it.
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <BackLink fallback="/carts" />
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">{title}</h1>
          {/* No pill while filling: OPEN needs none, and the bar already says "Minimum reached". */}
          {cart.status !== "OPEN" && cart.status !== "READY" && (
            <StatusBadge status={cart.status} />
          )}
          {cart.visibility === "PRIVATE" && <Badge>Private</Badge>}
        </div>
      </div>

      {sp.added && <Alert tone="good">Added and held for you.</Alert>}
      {sp.paid && <Toast>Slip uploaded. We&apos;ll check it.</Toast>}
      {typeof sp.error === "string" && <Alert>{sp.error}</Alert>}
      {sp.merge && <Toast>Done.</Toast>}
      {slip?.status === "REJECTED" && isOwner && cart.status === "AWAITING_SLIP" && (
        <Alert>Slip rejected: {slip.reviewNote}</Alert>
      )}

      {/* Progress, then always one next step. */}
      <Card className="flex flex-col gap-4">
        <div>
          <p>
            <span className="text-2xl font-bold tabular-nums">{formatLKR(cart.total)}</span>{" "}
            <span className="text-sm text-subtle">of {formatLKR(cart.minOrderValue)}</span>
          </p>
          <div
            className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct * 100)}
          >
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.max(2, pct * 100)}%` }}
            />
          </div>
          <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-accent">{toGo.gt(0) ? "" : "Minimum reached"}</span>
            {editable && (
              <span className="text-warn">
                <Countdown until={cart.expiresAt.toISOString()} />
              </span>
            )}
          </p>
        </div>
        <StatusPanel
          cart={cart}
          isOwner={isOwner}
          isMember={isMember}
          signedIn={!!user}
          defaults={user}
          merge={merge}
        />
      </Card>

      {joinRequests.length > 0 && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">Asking to join ({joinRequests.length})</h2>
          {joinRequests.map((r) => (
            <div
              key={r.id}
              className="flex flex-col gap-2 border-t border-line pt-3 first:border-0 first:pt-0"
            >
              <p className="text-sm">
                <strong>{r.user.name}</strong> wants to join with{" "}
                <strong>{formatLKR(cartTotal(r.lines))}</strong>.
              </p>
              <div className="flex gap-2">
                <form action={acceptMergeAction}>
                  <input type="hidden" name="requestId" value={r.id} />
                  <Button>Accept</Button>
                </form>
                <form action={declineMergeAction}>
                  <input type="hidden" name="requestId" value={r.id} />
                  <Button variant="secondary">Decline</Button>
                </form>
                <LinkButton href={conversationHref(cart.id, r.userId)} variant="secondary">
                  Message
                </LinkButton>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Who is in it: one box per person with their total; only your own box opens, to change your items. */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">In this cart</h2>
        <div className="flex flex-col gap-3">
          {cart.members.map((m) => {
            const lines = cart.lines.filter((l) => l.userId === m.userId);
            const mine = m.userId === user?.id;
            const who = (
              <span className="min-w-0 font-medium">
                {mine ? "You" : m.user.name}
                {m.userId === cart.ownerId && (
                  <span className="ml-2 text-xs text-accent">Owner</span>
                )}
              </span>
            );
            if (!mine)
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-line bg-paper p-4"
                >
                  {who}
                  <span className="text-sm font-semibold">{formatLKR(cartTotal(lines))}</span>
                </div>
              );
            return (
              <details
                key={m.id}
                open={editable}
                className="group rounded-xl border border-line bg-paper p-4"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                  {who}
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {formatLKR(cartTotal(lines))}
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0 text-subtle transition group-open:rotate-180"
                    >
                      <path d="m5 7.5 5 5 5-5" />
                    </svg>
                  </span>
                </summary>
                {lines.length === 0 ? (
                  <p className="mt-2 text-sm text-subtle">No items yet</p>
                ) : (
                  <ul className="mt-2 divide-y divide-line text-sm">
                    {lines.map((l) => (
                      <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                        <Link
                          href={`/products/${l.variant.product.id}`}
                          className="min-w-0 basis-full hover:underline sm:basis-0 sm:flex-1"
                        >
                          {l.variant.product.title}
                          <span className="text-subtle">
                            {" "}
                            · {l.variant.size}
                            {l.variant.colour ? ` · ${l.variant.colour}` : ""}
                          </span>
                        </Link>
                        {editable ? (
                          <form action={updateLineAction} className="flex items-center gap-1">
                            <input type="hidden" name="cartId" value={cart.id} />
                            <input type="hidden" name="variantId" value={l.variantId} />
                            <input
                              name="qty"
                              type="number"
                              min={0}
                              max={Math.min(99, l.qty + l.variant.available)}
                              defaultValue={l.qty}
                              aria-label="Quantity (0 removes it)"
                              className="h-11 w-16 rounded-lg border border-line bg-paper px-2 text-base sm:h-8 sm:rounded sm:text-sm"
                            />
                            <button className="h-11 rounded-lg border border-line px-3 text-sm hover:bg-muted sm:h-8 sm:rounded sm:px-2 sm:text-xs">
                              Update
                            </button>
                          </form>
                        ) : (
                          <span className="text-subtle">× {l.qty}</span>
                        )}
                        <span className="ml-auto text-right sm:w-28">
                          {formatLKR(lineTotal(l))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            );
          })}
        </div>
      </section>

      {/* Messages sit right under the people in the cart. */}
      {user && (!isOwner || threads.length > 0) && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">
            {isOwner ? "Messages" : `Chat with ${cart.owner.name.split(" ")[0]}`}
          </h2>
          <Card className="flex flex-col gap-3">
            {isOwner && (
              <div className="flex flex-wrap gap-2">
                {threads.map((t) => (
                  <Link
                    key={t.participantId}
                    href={`/c/${cart.code}?chat=${t.participantId}`}
                    className={`rounded-full border px-3 py-1 text-xs ${t.participantId === chatWith ? "border-ink font-semibold" : "border-line"}`}
                  >
                    {t.name}
                    {t.unread > 0 && (
                      <span className="ml-1 rounded-full bg-accent px-1.5 font-semibold text-on-accent">
                        {t.unread}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
            {(!isOwner || chatWith) && (
              <ChatPanel
                key={chatWith ?? "owner"}
                cartId={cart.id}
                withId={chatWith}
                meId={user.id}
                initial={chatMessages}
                otherName={chatName}
              />
            )}
          </Card>
        </section>
      )}

      {/* Rare, irreversible actions go last, as red buttons. */}
      {isMember && editable && !isOwner && (
        <form action={leaveAction}>
          <input type="hidden" name="cartId" value={cart.id} />
          <Button variant="danger" className="text-white">
            Leave cart
          </Button>
        </form>
      )}
      {isOwner && ["OPEN", "READY", "AWAITING_SLIP"].includes(cart.status) && (
        <form action={cancelAction}>
          <input type="hidden" name="cartId" value={cart.id} />
          <Button variant="danger" className="text-white">
            Cancel
          </Button>
        </form>
      )}
    </div>
  );
}

function StatusPanel({
  cart,
  isOwner,
  isMember,
  signedIn,
  defaults,
  merge,
}: {
  cart: FullCart;
  isOwner: boolean;
  isMember: boolean;
  signedIn: boolean;
  merge: {
    from: { name: string; code: string };
    request: { id: string } | null;
    reason: string | null;
  } | null;
  defaults: {
    address: string | null;
    city: string | null;
    phone: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
}) {
  switch (cart.status) {
    case "OPEN":
    case "READY":
      if (!signedIn)
        return (
          <Link
            href={`/sign-in?next=/c/${cart.code}`}
            className="inline-flex min-h-11 items-center justify-center sm:min-h-10 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent"
          >
            Sign in to join
          </Link>
        );
      if (!isMember && merge)
        // One message at a time: the reason it can't happen, or the question and its button.
        return merge.request ? (
          <form action={cancelMergeAction}>
            <input type="hidden" name="requestId" value={merge.request.id} />
            <Button variant="secondary">Cancel request</Button>
          </form>
        ) : merge.reason ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              You&apos;re in <strong>{merge.from.name || merge.from.code}</strong>. {merge.reason}
            </p>
            <div>
              <Link
                href={`/c/${merge.from.code}`}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-on-accent hover:opacity-90 sm:min-h-10"
              >
                Go to your cart
              </Link>
            </div>
          </div>
        ) : (
          <form action={requestMergeAction} className="flex flex-col gap-2">
            <input type="hidden" name="cartId" value={cart.id} />
            <p className="text-sm">You&apos;re in another cart. Move your items here?</p>
            <div>
              <Button className="w-full sm:w-auto">Ask to join</Button>
            </div>
          </form>
        );
      if (!isMember) return <JoinForm cartId={cart.id} defaults={defaults} />;
      // Members add items from the shop; an open cart needs no button here.
      if (cart.status === "OPEN") return null;
      return isOwner ? (
        <AcceptForm cartId={cart.id} back={`/c/${cart.code}`} defaults={defaults} />
      ) : (
        <p className="text-sm">Waiting for the owner to pay.</p>
      );
    case "AWAITING_SLIP":
      return isOwner ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-warn">
            <Countdown until={cart.slipDueAt!.toISOString()} />
          </p>
          <Link
            href={`/c/${cart.code}/pay`}
            className="inline-flex min-h-11 items-center justify-center sm:min-h-10 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent"
          >
            Pay &amp; upload slip
          </Link>
        </div>
      ) : (
        <p className="text-sm">The owner is paying.</p>
      );
    case "SLIP_REVIEW":
      return <p className="text-sm">Checking the payment.</p>;
    case "CONFIRMED":
      return <p className="text-sm">Paid. Packing for delivery.</p>;
    case "DISPATCHED":
    case "DELIVERED":
      return (
        <div className="flex flex-col gap-1 text-sm">
          <p>
            {cart.status === "DELIVERED" ? "Delivered" : "On the way"} to {cart.deliveryAddress},{" "}
            {cart.deliveryCity}.
          </p>
          {cart.delivery?.quotedFee && (
            <p className="text-subtle">
              Driver fee about {formatLKR(cart.delivery.quotedFee)}, paid by the owner.
            </p>
          )}
          {cart.delivery?.trackingUrl && (
            <a
              href={cart.delivery.trackingUrl}
              className="text-accent underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Track
            </a>
          )}
        </div>
      );
    case "EXPIRED":
    case "CANCELLED":
      return <p className="text-sm text-subtle">{cart.closedReason ?? "This cart is closed."}</p>;
  }
}
