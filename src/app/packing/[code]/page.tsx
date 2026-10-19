import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/client";
import { Toast } from "@/components/toast";
import { PackingTrail } from "@/components/packing-bits";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import {
  PACKABLE,
  PACKING_STAGE_LABEL,
  checkBlockReason,
  handOverBlockReason,
  packingStage,
} from "@/lib/packing-rules";
import { requirePacker } from "@/server/auth/session";
import { packingOrder } from "@/server/packing";
import {
  checkedAction,
  handedOverAction,
  packedAction,
  repackAction,
} from "@/server/packing-actions";
import { PackingForm } from "../packing-form";

export const metadata: Metadata = { title: "Pack order" };

/**
 * One order for the packing staff: every item by member (tick boxes are only for the packer's
 * eye and are not saved), the drop-off label, and the next step: pack, check (two different
 * people), hand to the PickMe driver. No prices: the staff only need what goes in the parcel.
 */
export default async function PackOrderPage({
  params,
  searchParams,
}: PageProps<"/packing/[code]">) {
  const staff = await requirePacker();
  const [{ code }, { done }] = await Promise.all([params, searchParams]);
  const cart = await packingOrder(code);
  if (!cart || (!cart.packing && !PACKABLE.includes(cart.status))) notFound();
  const stage = packingStage(cart.packing);
  const items = cart.lines.reduce((n, l) => n + l.qty, 0);
  const open = PACKABLE.includes(cart.status);
  const canCheck = open && !checkBlockReason(cart.packing, staff.id);
  const handOverBlock = handOverBlockReason(cart.packing, cart.delivery);
  const iChecked = cart.packing?.checks.some((c) => c.userId === staff.id) ?? false;
  const iPacked = cart.packing?.packedById === staff.id;
  const byMember = cart.members
    .map((m) => ({ ...m, lines: cart.lines.filter((l) => l.userId === m.userId) }))
    .filter((m) => m.lines.length > 0);

  return (
    <>
      <BackLink fallback="/packing" />
      {done === "packed" && <Toast>Packed. Now two other people check it.</Toast>}
      {done === "repack" && <Toast>Sent back to be packed again.</Toast>}
      <PageHeader
        title={`Cart ${cart.code}`}
        description={`For ${cart.owner.name} · ${items} ${items === 1 ? "item" : "items"}`}
        actions={
          <Badge tone={stage === "handed-over" ? "good" : "info"}>
            {PACKING_STAGE_LABEL[stage]}
          </Badge>
        }
      />

      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold">What goes in the parcel</h2>
        {byMember.map((m) => {
          const n = m.lines.reduce((k, l) => k + l.qty, 0);
          return (
            <div key={m.userId}>
              <h3 className="text-sm font-medium">
                {m.user.name}
                {m.userId === cart.ownerId && " (owner)"}
                <span className="font-normal text-subtle">
                  {" "}
                  · {n} {n === 1 ? "item" : "items"}
                </span>
              </h3>
              <ul className="mt-1 divide-y divide-line">
                {m.lines.map((l) => (
                  <li key={l.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5 text-sm">
                      <input type="checkbox" className="size-5 shrink-0 accent-accent" />
                      <span className="min-w-0 flex-1">
                        {l.variant.product.brand} {l.variant.product.title}
                        <span className="block text-xs text-subtle">
                          Size {l.variant.size}
                          {l.variant.colour && ` · ${l.variant.colour}`}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">× {l.qty}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <p className="text-xs text-subtle">
          Everything goes in one parcel to {cart.owner.name}, who hands the other members their
          items.
        </p>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">Packing</h2>
        <PackingTrail packing={cart.packing} you={staff.id} />

        {open && stage === "to-pack" && (
          <PackingForm
            action={packedAction}
            cartId={cart.id}
            code={cart.code}
            submit="I've packed it"
          >
            <p className="text-sm text-subtle">
              Pack every item above, then press this. Two other people then check the parcel.
            </p>
          </PackingForm>
        )}

        {open && stage === "to-check" && canCheck && (
          <PackingForm
            action={checkedAction}
            cartId={cart.id}
            code={cart.code}
            submit="Checked: everything is correct"
          >
            <p className="text-sm text-subtle">
              Open the parcel and compare it with the list. Press this only if every item, size and
              quantity is right. Your name goes on the order.
            </p>
          </PackingForm>
        )}
        {open && stage === "to-check" && iPacked && (
          <Alert tone="info">
            You packed this order, so you can&apos;t check it. Two other people must check it.
          </Alert>
        )}
        {open && stage === "to-check" && iChecked && (
          <Alert tone="info">You checked this order. Another person must check it too.</Alert>
        )}

        {open &&
          stage === "ready" &&
          (handOverBlock ? (
            <Alert tone="info">{handOverBlock}</Alert>
          ) : (
            <PackingForm
              action={handedOverAction}
              cartId={cart.id}
              code={cart.code}
              submit="Handed to the PickMe driver"
            >
              <p className="text-sm">
                PickMe booked
                {cart.delivery?.externalRef && ` · ${cart.delivery.externalRef}`}
                {cart.delivery?.driverName && ` · driver ${cart.delivery.driverName}`}
              </p>
            </PackingForm>
          ))}

        {open && (stage === "to-check" || stage === "ready") && (
          <details className="text-sm">
            <summary className="cursor-pointer py-2 text-danger">Something is wrong?</summary>
            <PackingForm
              action={repackAction}
              cartId={cart.id}
              code={cart.code}
              submit="Send it back to be packed again"
              variant="secondary"
            >
              <p className="text-subtle">
                This clears the packing and every check, so it is packed and checked again.
              </p>
            </PackingForm>
          </details>
        )}
      </Card>

      <Card className="text-sm">
        <h2 className="mb-2 font-semibold">Label for the parcel</h2>
        <p className="font-mono text-xs text-subtle">Cart {cart.code}</p>
        <p className="font-medium">
          {cart.owner.name}
          {cart.deliveryPhone && ` · ${cart.deliveryPhone}`}
        </p>
        <p>
          {cart.deliveryAddress}
          {cart.deliveryCity && `, ${cart.deliveryCity}`}
        </p>
        <p className="mt-2 text-xs text-subtle">
          The owner pays the PickMe driver. Never take money for delivery.
        </p>
      </Card>
    </>
  );
}
