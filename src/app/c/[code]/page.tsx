import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProgressBar, StatusBadge } from "@/components/cart-bits";
import { CopyLink, Countdown } from "@/components/client";
import { Alert, Badge, Button, Card } from "@/components/ui";
import { cartTotal, isEditable, lineTotal, whatsappShareUrl } from "@/lib/cart-rules";
import { formatLKR } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { cancelAction, joinAction, leaveAction, updateLineAction } from "@/server/carts/actions";
import { type FullCart, cartByCode } from "@/server/carts/queries";
import { sweep } from "@/server/carts/service";
import { appUrl } from "@/server/notify";
import { getSettings } from "@/server/settings";
import { AcceptForm, InviteForm } from "./cart-forms";

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
  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);

  const isOwner = user?.id === cart.ownerId;
  const isMember = !!user && cart.members.some((m) => m.userId === user.id);
  const editable = isEditable(cart.status);
  const url = appUrl(`/c/${cart.code}`);
  const title = cart.name || `${cart.owner.name}'s group cart`;
  const shareText = `Join my GroupTogether cart "${title}" and let's reach ${formatLKR(cart.minOrderValue)} together: ${url}`;
  const slip = cart.slips[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <StatusBadge status={cart.status} />
            {cart.visibility === "PRIVATE" && <Badge>Private</Badge>}
          </div>
          <p className="mt-1 text-sm text-subtle">
            Started by {cart.owner.name} · code <span className="font-mono">{cart.code}</span>
          </p>
        </div>

        {sp.added && <Alert tone="good">Added. Your items are held for you in this cart.</Alert>}
        {sp.paid && (
          <Alert tone="good">
            Slip uploaded. We&apos;ll confirm the order once we&apos;ve checked it.
          </Alert>
        )}
        {typeof sp.error === "string" && <Alert>{sp.error}</Alert>}

        <Card className="flex flex-col gap-3">
          <ProgressBar total={cart.total} min={cart.minOrderValue} />
          {editable && (
            <p className="text-sm text-warn">
              <Countdown until={cart.expiresAt.toISOString()} prefix="Expires: " />
            </p>
          )}
          <StatusPanel
            cart={cart}
            isOwner={isOwner}
            isMember={isMember}
            signedIn={!!user}
            settings={settings}
            defaults={user}
          />
        </Card>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Members ({cart.members.length})</h2>
          <div className="flex flex-col gap-3">
            {cart.members.map((m) => {
              const lines = cart.lines.filter((l) => l.userId === m.userId);
              const mine = m.userId === user?.id;
              return (
                <Card key={m.id} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">
                      {m.user.name}
                      {m.userId === cart.ownerId && (
                        <span className="ml-2 text-xs text-accent">Owner</span>
                      )}
                      {mine && <span className="ml-2 text-xs text-subtle">(you)</span>}
                    </p>
                    <p className="text-sm font-semibold">{formatLKR(cartTotal(lines))}</p>
                  </div>
                  {lines.length === 0 ? (
                    <p className="mt-2 text-sm text-subtle">No items yet</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-line text-sm">
                      {lines.map((l) => (
                        <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                          <Link
                            href={`/products/${l.variant.product.id}`}
                            className="min-w-0 flex-1 hover:underline"
                          >
                            {l.variant.product.title}
                            <span className="text-subtle">
                              {" "}
                              · {l.variant.size}
                              {l.variant.colour ? ` · ${l.variant.colour}` : ""}
                            </span>
                          </Link>
                          {mine && editable ? (
                            <form action={updateLineAction} className="flex items-center gap-1">
                              <input type="hidden" name="cartId" value={cart.id} />
                              <input type="hidden" name="variantId" value={l.variantId} />
                              <input
                                name="qty"
                                type="number"
                                min={0}
                                max={Math.min(99, l.qty + l.variant.available)}
                                defaultValue={l.qty}
                                aria-label="Quantity"
                                className="h-8 w-16 rounded border border-line bg-paper px-2"
                              />
                              <button className="h-8 rounded border border-line px-2 text-xs hover:bg-muted">
                                Update
                              </button>
                            </form>
                          ) : (
                            <span className="text-subtle">× {l.qty}</span>
                          )}
                          <span className="w-28 text-right">{formatLKR(lineTotal(l))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })}
          </div>
          {isMember && editable && (
            <p className="mt-2 text-xs text-subtle">Set a quantity to 0 to remove an item.</p>
          )}
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        {editable && (
          <Card className="flex flex-col gap-3">
            <h2 className="font-semibold">Bring people in</h2>
            <p className="text-sm text-subtle">Share the link. Anyone with it can join.</p>
            <div className="flex flex-wrap gap-2">
              <CopyLink url={url} />
              <a
                href={whatsappShareUrl(shareText)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center rounded-lg bg-[#25D366] px-4 text-sm font-medium text-black hover:opacity-90"
              >
                WhatsApp
              </a>
            </div>
            {isMember && <InviteForm cartId={cart.id} />}
          </Card>
        )}
        {isMember && editable && !isOwner && (
          <form action={leaveAction}>
            <input type="hidden" name="cartId" value={cart.id} />
            <Button variant="secondary" className="w-full">
              Leave cart (your items go back on sale)
            </Button>
          </form>
        )}
        {isOwner && ["OPEN", "READY", "AWAITING_SLIP"].includes(cart.status) && (
          <form action={cancelAction}>
            <input type="hidden" name="cartId" value={cart.id} />
            <Button variant="secondary" className="w-full">
              Cancel this cart
            </Button>
          </form>
        )}
        {slip?.status === "REJECTED" && isOwner && cart.status === "AWAITING_SLIP" && (
          <Alert>Your last slip was not accepted: {slip.reviewNote}</Alert>
        )}
      </aside>
    </div>
  );
}

function StatusPanel({
  cart,
  isOwner,
  isMember,
  signedIn,
  settings,
  defaults,
}: {
  cart: FullCart;
  isOwner: boolean;
  isMember: boolean;
  signedIn: boolean;
  settings: { slipWindowHours: number };
  defaults: { address: string | null; city: string | null; phone: string | null } | null;
}) {
  const shopLink = (
    <Link
      href={`/shop?cart=${cart.code}`}
      className="inline-flex min-h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-on-accent hover:opacity-90"
    >
      Add items
    </Link>
  );
  switch (cart.status) {
    case "OPEN":
    case "READY":
      if (!signedIn)
        return (
          <Link
            href={`/sign-in?next=/c/${cart.code}`}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-on-accent"
          >
            Sign in to join this cart
          </Link>
        );
      if (!isMember)
        return (
          <form action={joinAction}>
            <input type="hidden" name="cartId" value={cart.id} />
            <Button className="w-full sm:w-auto">Join this cart</Button>
          </form>
        );
      if (cart.status === "OPEN") return <div>{shopLink}</div>;
      return isOwner ? (
        <div className="flex flex-col gap-3">
          <Alert tone="good">
            The cart reached the minimum. Accept the order to lock it, then pay{" "}
            <strong>{formatLKR(cart.total)}</strong> by bank transfer and upload the slip within{" "}
            {settings.slipWindowHours} hours. Members pay their share to you directly.
          </Alert>
          <AcceptForm cartId={cart.id} defaults={defaults} />
          <div>{shopLink}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Alert tone="good">
            The minimum is reached. Waiting for the owner to accept and pay.
          </Alert>
          <div>{shopLink}</div>
        </div>
      );
    case "AWAITING_SLIP":
      return isOwner ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-warn">
            <Countdown until={cart.slipDueAt!.toISOString()} prefix="Upload your slip: " />
          </p>
          <Link
            href={`/c/${cart.code}/pay`}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-on-accent"
          >
            Pay {formatLKR(cart.total)} and upload the slip
          </Link>
        </div>
      ) : (
        <p className="text-sm">The owner has accepted and is paying for the whole cart.</p>
      );
    case "SLIP_REVIEW":
      return <p className="text-sm">The bank slip is uploaded. We&apos;re checking the payment.</p>;
    case "CONFIRMED":
      return (
        <Alert tone="good">
          Payment confirmed. We&apos;re packing the order for PickMe delivery.
        </Alert>
      );
    case "DISPATCHED":
    case "DELIVERED":
      return (
        <div className="flex flex-col gap-1 text-sm">
          <p>
            {cart.status === "DELIVERED" ? "Delivered" : "On the way"} by PickMe to{" "}
            {cart.deliveryAddress}, {cart.deliveryCity}.
          </p>
          {cart.delivery?.quotedFee && (
            <p>
              Delivery fee about <strong>{formatLKR(cart.delivery.quotedFee)}</strong>, paid by the
              owner to the driver.
            </p>
          )}
          {cart.delivery?.trackingUrl && (
            <a
              href={cart.delivery.trackingUrl}
              className="text-accent underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Track the delivery
            </a>
          )}
        </div>
      );
    case "EXPIRED":
    case "CANCELLED":
      return <p className="text-sm text-subtle">{cart.closedReason ?? "This cart is closed."}</p>;
  }
}
