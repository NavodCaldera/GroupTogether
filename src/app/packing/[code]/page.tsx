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
 * people), hand to the PickMe driver. No prices and the fewest words (product owner,
 * 2026-10-19): the staff only need what goes in the parcel.
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
      {done === "packed" && <Toast>Packed.</Toast>}
      {done === "repack" && <Toast>Sent back to pack.</Toast>}
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
        ))}
      </Card>

      <Card className="flex flex-col gap-3">
        <PackingTrail packing={cart.packing} you={staff.id} brief />

        {open && stage === "to-pack" && (
          <PackingForm
            action={packedAction}
            cartId={cart.id}
            code={cart.code}
            submit="I've packed it"
          />
        )}

        {open && stage === "to-check" && canCheck && (
          <PackingForm
            action={checkedAction}
            cartId={cart.id}
            code={cart.code}
            submit="Checked: everything is correct"
          />
        )}
        {open && stage === "to-check" && iPacked && (
          <Alert tone="info">You packed it, so two others check it.</Alert>
        )}
        {open && stage === "to-check" && iChecked && (
          <Alert tone="info">You checked it. One more person must check.</Alert>
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

        {open && (stage === "to-check" || stage === "ready") && (
          <details className="text-sm">
            <summary className="cursor-pointer py-2 text-danger">Something wrong?</summary>
            <PackingForm
              action={repackAction}
              cartId={cart.id}
              code={cart.code}
              submit="Pack it again"
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
