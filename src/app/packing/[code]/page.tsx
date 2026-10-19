import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/client";
import { Toast } from "@/components/toast";
import { PackingTrail } from "@/components/packing-bits";
import { Alert, Badge, Card, PageHeader, cx } from "@/components/ui";
import {
  PACKABLE,
  PACKING_STAGE_LABEL,
  handOverBlockReason,
  packBlockReason,
  packingStage,
} from "@/lib/packing-rules";
import { requirePacker } from "@/server/auth/session";
import { packingOrder } from "@/server/packing";
import {
  gatheredAction,
  handedOverAction,
  packedAction,
  sendBackAction,
} from "@/server/packing-actions";
import { PackingForm } from "../packing-form";

export const metadata: Metadata = { title: "Pack order" };

/**
 * One order for the packing staff: every item by member (tick boxes are only for the packer's
 * eye and are not saved; once packed they show as fixed ticks), the drop-off label, and the next step: check and gather, recheck and
 * pack (a different person), hand to the PickMe driver. No prices and the fewest words (product
 * owner, 2026-10-19): the staff only need what goes in the parcel.
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
  // Once packed every item is ticked for good (product owner, 2026-10-20).
  const packed = stage === "ready" || stage === "handed-over";
  const items = cart.lines.reduce((n, l) => n + l.qty, 0);
  const open = PACKABLE.includes(cart.status);
  const canPack = open && !packBlockReason(cart.packing, staff.id);
  const handOverBlock = handOverBlockReason(cart.packing, cart.delivery);
  const iGathered = cart.packing?.gatheredById === staff.id;
  const byMember = cart.members
    .map((m) => ({ ...m, lines: cart.lines.filter((l) => l.userId === m.userId) }))
    .filter((m) => m.lines.length > 0);

  return (
    <>
      <BackLink fallback="/packing" />
      {done === "packed" && <Toast>Packed.</Toast>}
      {done === "sent-back" && <Toast>Sent back to gather.</Toast>}
      <PageHeader
        title={cart.code}
        description={`${items} ${items === 1 ? "item" : "items"}`}
        actions={
          <Badge tone={stage === "handed-over" ? "good" : "info"}>
            {PACKING_STAGE_LABEL[stage]}
          </Badge>
        }
      />

      <Card className="flex flex-col gap-4">
        {byMember.map((m) => (
          <div key={m.userId}>
            <h3 className="text-sm font-medium">{m.user.name}</h3>
            <ul className="mt-1 divide-y divide-line">
              {m.lines.map((l) => (
                <li key={l.id}>
                  <label
                    className={cx(
                      "flex min-h-11 items-center gap-3 py-1.5 text-sm",
                      !packed && "cursor-pointer",
                    )}
                  >
                    {packed ? (
                      <span
                        role="img"
                        aria-label="Packed"
                        className="grid size-5 shrink-0 place-items-center rounded bg-accent text-xs font-bold text-on-accent"
                      >
                        ✓
                      </span>
                    ) : (
                      <input type="checkbox" className="size-5 shrink-0 accent-accent" />
                    )}
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
        ))}
      </Card>

      <Card className="flex flex-col gap-3">
        <PackingTrail packing={cart.packing} you={staff.id} brief />

        {open && stage === "to-gather" && (
          <PackingForm
            action={gatheredAction}
            cartId={cart.id}
            code={cart.code}
            submit="Checked and gathered"
          />
        )}

        {open && stage === "to-pack" && canPack && (
          <PackingForm
            action={packedAction}
            cartId={cart.id}
            code={cart.code}
            submit="Rechecked and packed"
          />
        )}
        {open && stage === "to-pack" && iGathered && (
          <Alert tone="info">You gathered it, so someone else packs it.</Alert>
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
              {cart.delivery?.driverName && (
                <p className="text-sm">Driver: {cart.delivery.driverName}</p>
              )}
            </PackingForm>
          ))}

        {/* Only between gathering and packing: once packed it is final (product owner, 2026-10-20). */}
        {open && stage === "to-pack" && (
          <details className="text-sm">
            <summary className="cursor-pointer py-2 text-danger">Something wrong?</summary>
            <PackingForm
              action={sendBackAction}
              cartId={cart.id}
              code={cart.code}
              submit="Gather it again"
              variant="secondary"
            />
          </details>
        )}
      </Card>

      <Card className="text-sm">
        <h2 className="mb-1 font-semibold">Label</h2>
        <p className="font-medium">
          {cart.owner.name}
          {cart.deliveryPhone && ` · ${cart.deliveryPhone}`}
        </p>
        <p>
          {cart.deliveryAddress}
          {cart.deliveryCity && `, ${cart.deliveryCity}`}
        </p>
      </Card>
    </>
  );
}
