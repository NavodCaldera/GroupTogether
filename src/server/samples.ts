import "server-only";
import { z } from "zod";
import type { SampleStatus } from "@/generated/prisma/client";
import { toD } from "@/lib/decimal";
import { assertAdminArea } from "./auth/service";
import { CartError } from "./carts/service";
import { db } from "./db";
import { notify, notifyRole } from "./notify";

const requestSchema = z.object({
  cartId: z.string().min(1),
  productId: z.string().min(1),
  designNote: z.string().trim().max(500),
});

export async function requestSample(userId: string, input: unknown) {
  const data = requestSchema.parse(input);
  const sample = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "GroupCart" WHERE id = ${data.cartId} FOR UPDATE`;
    const [cart, product, user] = await Promise.all([
      tx.groupCart.findUnique({
        where: { id: data.cartId },
        select: { ownerId: true, status: true, expiresAt: true },
      }),
      tx.product.findFirst({
        where: {
          id: data.productId,
          category: "APPAREL",
          variants: { some: { available: { gt: 0 } } },
          OR: [{ sellerId: null }, { seller: { isBrand: false } }],
        },
        select: { id: true },
      }),
      tx.user.findUnique({
        where: { id: userId },
        select: {
          role: true,
          locked: true,
          name: true,
          address: true,
          city: true,
          phone: true,
          lat: true,
          lng: true,
        },
      }),
    ]);
    if (!cart || cart.ownerId !== userId || user?.role !== "CUSTOMER" || user.locked)
      throw new CartError("Only the group owner can request its sample");
    if (!["OPEN", "READY"].includes(cart.status) || cart.expiresAt <= new Date())
      throw new CartError("Request samples before accepting the group purchase");
    if (!product) throw new CartError("Choose an apparel design");
    if (!user.address || !user.city || !user.phone || user.lat === null || user.lng === null)
      throw new CartError("Complete your delivery profile first");
    const existing = await tx.sampleRequest.findFirst({
      where: {
        cartId: data.cartId,
        productId: data.productId,
        status: { in: ["REQUESTED", "QUOTED", "ACCEPTED", "DISPATCHED"] },
      },
      select: { id: true },
    });
    if (existing)
      throw new CartError("This group already has an active sample request for this design");
    return tx.sampleRequest.create({
      data: {
        ...data,
        requesterId: userId,
        recipientName: user.name,
        address: user.address,
        city: user.city,
        phone: user.phone,
        lat: user.lat,
        lng: user.lng,
      },
    });
  });
  const admins = await db.user.findMany({
    where: { role: "ADMIN", locked: false, adminArea: "WAREHOUSE" },
    select: { id: true },
  });
  await notify(
    admins.map((a) => a.id),
    {
      title: "Design sample requested",
      body: "A group requested a pre-purchase apparel sample.",
      href: "/admin/warehouse",
    },
  );
  await notifyRole(
    "ADMIN",
    {
      title: "Apparel sample demand",
      body: "A group requested an apparel design sample. Review design demand for sourcing.",
      href: "/admin/factory",
    },
    "FACTORY",
  );
  return sample;
}

const updateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["QUOTED", "DISPATCHED", "DELIVERED", "DECLINED"]),
  transportFee: z
    .string()
    .regex(/^\d{1,12}(\.\d{1,2})?$/)
    .optional(),
  courier: z.string().trim().max(100).optional(),
  tracking: z.string().trim().max(300).optional(),
  note: z.string().trim().max(500).optional(),
});

export async function updateSample(adminId: string, input: unknown) {
  await assertAdminArea(adminId, "WAREHOUSE");
  const data = updateSchema.parse(input);
  const updated = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "SampleRequest" WHERE id = ${data.id} FOR UPDATE`;
    const sample = await tx.sampleRequest.findUnique({ where: { id: data.id } });
    if (!sample) throw new CartError("Sample request not found");
    const allowed: Partial<Record<SampleStatus, SampleStatus[]>> = {
      REQUESTED: ["QUOTED", "DECLINED"],
      QUOTED: ["QUOTED", "DECLINED"],
      ACCEPTED: ["DISPATCHED"],
      DISPATCHED: ["DELIVERED"],
    };
    if (!allowed[sample.status]?.includes(data.status))
      throw new CartError("This sample has moved to another stage; refresh the page");
    if (data.status === "QUOTED" && !data.transportFee)
      throw new CartError("Enter the group's transport quote");
    if (data.status === "DISPATCHED" && (!data.courier || !data.tracking))
      throw new CartError("Enter the courier and tracking reference");
    return tx.sampleRequest.update({
      where: { id: data.id },
      data: {
        status: data.status,
        handledById: adminId,
        ...(data.status === "QUOTED"
          ? { transportFee: toD(data.transportFee!), acceptedAt: null }
          : {}),
        ...(data.status === "DISPATCHED"
          ? { courier: data.courier, tracking: data.tracking, dispatchedAt: new Date() }
          : {}),
        ...(data.status === "DELIVERED" ? { deliveredAt: new Date() } : {}),
        note: data.note || null,
      },
    });
  });
  await notify([updated.requesterId], {
    title: "Sample request updated",
    body: `Your group's sample is ${updated.status.toLowerCase()}. No sample sending fee; your group pays transport.`,
    href: "/samples",
  });
  return updated;
}

export async function acceptSampleTransport(
  userId: string,
  id: string,
  expectedTransportFee: string,
) {
  z.string()
    .regex(/^\d{1,12}(\.\d{1,2})?$/)
    .parse(expectedTransportFee);
  const accepted = await db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { role: true, locked: true },
    });
    if (!user || user.role !== "CUSTOMER" || user.locked)
      throw new CartError("This sample request is unavailable to your account");
    await tx.$queryRaw`SELECT 1 FROM "SampleRequest" WHERE id = ${id} FOR UPDATE`;
    const sample = await tx.sampleRequest.findUnique({ where: { id } });
    if (!sample || sample.requesterId !== userId)
      throw new CartError("This is not your group's sample request");
    if (
      sample.status !== "QUOTED" ||
      sample.transportFee === null ||
      !toD(sample.transportFee).eq(expectedTransportFee)
    )
      throw new CartError("This transport quote is no longer available");
    return tx.sampleRequest.update({
      where: { id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
  });
  await notifyRole(
    "ADMIN",
    {
      title: "Sample transport accepted",
      body: "A group accepted its sample transport quote; prepare dispatch.",
      href: "/admin/warehouse",
    },
    "WAREHOUSE",
  );
  return accepted;
}
