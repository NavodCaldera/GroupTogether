import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/client";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getProduct } from "@/server/catalogue";
import { startOwnBasketAction } from "../actions";
import { SizeQuantities, TokensField } from "../own-bits";

export const metadata: Metadata = { title: "Start own basket" };

export default async function NewOwnBasketPage({ searchParams }: PageProps<"/own-baskets/new">) {
  const sp = await searchParams;
  const productId = typeof sp.product === "string" ? sp.product : "";
  const user = await requireUser(
    [...BUYER_ROLES],
    `/own-baskets/new?product=${encodeURIComponent(productId)}`,
  );
  const product = productId ? await getProduct(productId) : null;
  if (!product || product.status !== "LIVE") notFound();
  // Prefilled from the profile; the owner can change them for this basket.
  const profile = await db.user.findUnique({
    where: { id: user.id },
    select: { address: true, city: true, phone: true },
  });
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div>
        <BackLink fallback={`/products/${product.id}`} />
        <h1 className="text-2xl font-semibold tracking-tight">Start own basket</h1>
        <p className="text-sm text-subtle">{product.title}</p>
      </div>
      {error && <Alert>{error}</Alert>}
      <Card>
        <form action={startOwnBasketAction} className="flex flex-col gap-5">
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="requestKey" value={randomUUID()} />
          <SizeQuantities
            price={product.price}
            variants={product.variants.map((v) => ({
              id: v.id,
              size: v.size,
              colour: v.colour,
              available: v.available,
            }))}
          />
          <Field label="Delivery address" name="address">
            <Textarea
              id="address"
              name="address"
              maxLength={300}
              rows={3}
              required
              defaultValue={profile?.address ?? ""}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Town or area" name="area">
              <Input
                id="area"
                name="area"
                maxLength={60}
                required
                defaultValue={profile?.city ?? ""}
              />
            </Field>
            <Field label="Phone" name="phone">
              <Input
                id="phone"
                name="phone"
                type="tel"
                maxLength={30}
                required
                defaultValue={profile?.phone ?? ""}
              />
            </Field>
          </div>
          <Field label="Who can join" name="visibility">
            <Select id="visibility" name="visibility" defaultValue="LINK">
              <option value="LINK">People with the link</option>
              <option value="PUBLIC">Anyone</option>
            </Select>
          </Field>
          <TokensField />
          <Button type="submit" className="self-start">
            Pay and start
          </Button>
        </form>
      </Card>
    </div>
  );
}
