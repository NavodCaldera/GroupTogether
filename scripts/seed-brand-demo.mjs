/** Additive local preview fixtures. Never resets data or overwrites existing demo records. */
import "dotenv/config";
import pg from "pg";
import { hashPassword, verifyPassword } from "../src/server/auth/password.ts";

const url = new URL(process.env.DATABASE_URL || "postgres://invalid");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  url.port !== "5546" ||
  url.pathname !== "/groupbasket"
) {
  throw new Error("Demo fixtures are restricted to the local GroupBasket database on port 5546.");
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const prefix = "demo-brand-rewards-v1-";
const id = (name) => prefix + name;
const now = new Date();
const ago = (days) => new Date(now.getTime() - days * 86_400_000);
const additions = {};

// Prices are decimal strings; PostgreSQL performs all money arithmetic.
const products = [
  ["care", "[Demo] Signature care gift set", "5000", "3500", 20, "ACCEPTED", false, null],
  ["linen", "[Demo] Premium linen accessory set", "7500", "5250", 12, "ACCEPTED", false, null],
  ["paused", "[Demo] Botanical travel gift set", "6500", "4550", 8, "ACCEPTED", true, null],
  ["soldout", "[Demo] Limited edition gift box", "9000", "6300", 1, "ACCEPTED", false, null],
  [
    "review",
    "[Demo] Everyday essentials gift",
    "4000",
    "2800",
    12,
    "IN_REVIEW",
    false,
    "Demo: awaiting price and presentation review.",
  ],
  [
    "declined",
    "[Demo] Seasonal sampler",
    "3000",
    "2100",
    10,
    "DECLINED",
    false,
    "Demo: please revise the partner price and resubmit.",
  ],
];

const orders = [
  { key: "reserved", product: "care", status: "RESERVED", name: "Nimali", days: 0 },
  { key: "ready-review", product: "care", status: "READY", name: "Ravindu", days: 1 },
  {
    key: "ready-approved",
    product: "linen",
    status: "READY",
    name: "Tharushi",
    days: 1,
    approved: true,
  },
  {
    key: "dispatched",
    product: "care",
    status: "DISPATCHED",
    name: "Dinuka",
    days: 2,
    approved: true,
  },
  {
    key: "delivered-unpaid",
    product: "care",
    status: "DELIVERED",
    name: "Isuri",
    days: 3,
    approved: true,
  },
  { key: "issue", product: "care", status: "ISSUE", name: "Malith", days: 2, approved: true },
  { key: "cancelled", product: "care", status: "CANCELLED", name: "Sanduni", days: 1 },
  {
    key: "settled-recent",
    product: "care",
    status: "DELIVERED",
    name: "Kavindu",
    days: 5,
    approved: true,
    settlement: "recent",
  },
  {
    key: "settled-previous",
    product: "care",
    status: "DELIVERED",
    name: "Pavithra",
    days: 12,
    approved: true,
    settlement: "previous",
  },
  { key: "paused-order", product: "paused", status: "READY", name: "Chamath", days: 1 },
  {
    key: "out-of-stock",
    product: "soldout",
    status: "DELIVERED",
    name: "Dilini",
    days: 3,
    approved: true,
  },
];

async function insert(table, columns, values, expression) {
  const columnsSql = columns.map((column) => `"${column}"`).join(", ");
  const slots = values.map((_, index) => `$${index + 1}`).join(", ");
  const result = await db.query(
    `INSERT INTO "${table}" (${columnsSql}) VALUES (${expression || slots}) ON CONFLICT (id) DO NOTHING`,
    values,
  );
  additions[table] = (additions[table] || 0) + result.rowCount;
}

await db.connect();
try {
  await db.query("BEGIN");
  await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [prefix]);
  const brand = (
    await db.query(
      `SELECT id, website, "passwordHash" FROM "User" WHERE email=$1 AND role='SELLER' AND "isBrand"=true AND locked=false`,
      ["brand@example.com"],
    )
  ).rows[0];
  if (!brand || !new URL(brand.website).hostname.endsWith(".example")) {
    throw new Error(
      "The fictional brand@example.com demo account with a .example website is required.",
    );
  }
  const admin = (
    await db.query(`SELECT id FROM "User" WHERE email=$1 AND role='ADMIN' AND locked=false`, [
      "premium@groupbasket.lk",
    ])
  ).rows[0];
  if (!admin) throw new Error("The demo premium admin account is required.");

  const passwordHash = await hashPassword("password123");
  for (const [key, name, retail, partner, pieces, status, paused, note] of products) {
    await insert(
      "StockOffer",
      [
        "id",
        "sellerId",
        "name",
        "description",
        "amount",
        "kind",
        "actualPrice",
        "offerPrice",
        "pieces",
        "productUrl",
        "status",
        "paused",
        "note",
        "decidedAt",
        "createdAt",
      ],
      [
        id(`product-${key}`),
        brand.id,
        name,
        "Fictional preview data only. Do not dispatch or pay a real supplier for this demo.",
        partner,
        pieces,
        retail,
        new URL(`/demo/${key}`, brand.website).href,
        status,
        paused,
        note,
        status === "IN_REVIEW" ? null : ago(14),
        ago(15),
      ],
      "$1,$2,$3,$4,$5::numeric * $6::integer,'BULK',$7,$5,$6,$8,$9,$10,$11,$12,$13",
    );
  }

  // Demo garments have no free shop stock; they exist only to keep basket totals consistent.
  await insert(
    "Product",
    [
      "id",
      "title",
      "brand",
      "category",
      "stockType",
      "price",
      "audience",
      "kind",
      "description",
      "updatedAt",
    ],
    [
      id("clothing"),
      "[Demo] Clothing bundle for gift previews",
      "GroupBasket Demo",
      "APPAREL",
      "FACTORY_SURPLUS",
      "25000",
      "MEN",
      "men-shirts",
      "Demo basket support; not offered in the shop.",
      now,
    ],
  );
  await insert(
    "Variant",
    ["id", "productId", "size", "colour", "available", "reserved", "sold"],
    [
      id("variant"),
      id("clothing"),
      "M",
      "",
      0,
      2,
      orders.filter((order) => !["RESERVED", "CANCELLED"].includes(order.status)).length * 2,
    ],
  );

  const local = new Date(now.getTime() + 330 * 60_000);
  const sunday = new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() - local.getUTCDay(),
      6,
    ),
  );
  for (const [key, paidAt] of [
    ["recent", sunday],
    ["previous", new Date(sunday.getTime() - 7 * 86_400_000)],
  ]) {
    await insert(
      "GiftSettlement",
      ["id", "brandId", "amount", "reference", "settledById", "paidAt"],
      [
        id(`settlement-${key}`),
        brand.id,
        "3500",
        `DEMO ONLY - ${key.toUpperCase()} SUNDAY PAYMENT`,
        admin.id,
        paidAt,
      ],
    );
  }

  for (const [index, order] of orders.entries()) {
    const userId = id(`customer-${order.key}`);
    const cartId = id(`basket-${order.key}`);
    const isUnpaid = ["RESERVED", "CANCELLED"].includes(order.status);
    const paidAt = isUnpaid ? null : ago(order.days);
    const person = `${order.name} (Demo)`;
    const phone = `070990${String(index + 1000).padStart(4, "0")}`;
    const address = "Demo address only - do not arrange a real delivery";
    const campaign = products.find(([key]) => key === order.product);
    await insert(
      "User",
      ["id", "role", "name", "email", "phone", "passwordHash", "address", "city", "lat", "lng"],
      [
        userId,
        "CUSTOMER",
        person,
        `gift-demo-${order.key}@example.com`,
        phone,
        passwordHash,
        address,
        "Colombo",
        6.9271,
        79.8612,
      ],
    );
    await insert(
      "GroupCart",
      [
        "id",
        "code",
        "name",
        "ownerId",
        "visibility",
        "status",
        "minOrderValue",
        "total",
        "expiresAt",
        "readyAt",
        "acceptedAt",
        "confirmedAt",
        "deliveryAddress",
        "deliveryCity",
        "deliveryPhone",
        "createdAt",
        "updatedAt",
        "closedReason",
      ],
      [
        cartId,
        `GDEMO${String(index + 1).padStart(3, "0")}`,
        `${person}'s cart`,
        userId,
        "PRIVATE",
        order.status === "RESERVED"
          ? "READY"
          : order.status === "CANCELLED"
            ? "CANCELLED"
            : "CONFIRMED",
        "50000",
        "50000",
        new Date(now.getTime() + 24 * 3600_000),
        ago(order.days),
        paidAt,
        paidAt,
        address,
        "Colombo",
        phone,
        ago(order.days),
        now,
        order.status === "CANCELLED" ? "Demo: basket cancelled before payment" : null,
      ],
    );
    await insert(
      "CartMember",
      ["id", "cartId", "userId", "address", "city", "lat", "lng"],
      [id(`member-${order.key}`), cartId, userId, address, "Colombo", 6.9271, 79.8612],
    );
    await insert(
      "CartLine",
      ["id", "cartId", "userId", "variantId", "qty", "unitPrice"],
      [id(`line-${order.key}`), cartId, userId, id("variant"), 2, "25000"],
    );
    const dispatched = ["DISPATCHED", "DELIVERED", "ISSUE"].includes(order.status);
    await insert(
      "GiftOrder",
      [
        "id",
        "offerId",
        "cartId",
        "recipientId",
        "status",
        "retailValue",
        "partnerPrice",
        "recipientName",
        "phone",
        "address",
        "city",
        "authorizedById",
        "courier",
        "tracking",
        "issue",
        "paidAt",
        "dispatchedAt",
        "deliveredAt",
        "billApprovedAt",
        "billApprovedById",
        "settlementId",
        "createdAt",
      ],
      [
        id(`gift-${order.key}`),
        id(`product-${order.product}`),
        cartId,
        userId,
        order.status,
        campaign[2],
        campaign[3],
        person,
        phone,
        address,
        "Colombo",
        admin.id,
        dispatched ? "Demo courier - no real shipment" : null,
        dispatched ? `DEMO-TRACK-${String(index + 1).padStart(3, "0")}` : null,
        order.status === "ISSUE"
          ? "Demo: recipient unavailable; awaiting redelivery arrangements."
          : null,
        paidAt,
        dispatched ? new Date(paidAt.getTime() + 3600_000) : null,
        order.status === "DELIVERED" ? new Date(paidAt.getTime() + 2 * 3600_000) : null,
        order.approved ? paidAt : null,
        order.approved ? admin.id : null,
        order.settlement ? id(`settlement-${order.settlement}`) : null,
        ago(order.days),
      ],
    );
  }

  // Add missing initial review history without changing existing revisions or decisions.
  await db.query(
    `INSERT INTO "BrandOfferRevision" ("id","offerId","version","snapshot","status","submittedById","reviewedAt","createdAt")
    SELECT 'demo-revision-' || o.id,o.id,1,jsonb_build_object('name',o.name,'description',o.description,'actualPrice',o."actualPrice"::text,'offerPrice',o."offerPrice"::text,'pieces',o.pieces,'productUrl',o."productUrl",'photoKey',o."photoKey",'photoType',o."photoType",'packDetails',o."packDetails",'packSize',o."packSize",'dispatchDays',o."dispatchDays",'hasExpiry',o."hasExpiry",'expiryDate',o."expiryDate",'minShelfLifeDays',o."minShelfLifeDays"),o.status,o."sellerId",o."decidedAt",o."createdAt"
    FROM "StockOffer" o WHERE o.id LIKE $1 AND NOT EXISTS (SELECT 1 FROM "BrandOfferRevision" r WHERE r."offerId"=o.id)`,
    [prefix + "%"],
  );
  await db.query(
    `UPDATE "StockOffer" SET "approvedRevision"=1 WHERE id LIKE $1 AND status='ACCEPTED' AND revision=1 AND "approvedRevision" IS NULL`,
    [prefix + "%"],
  );
  const invalid = await db.query(
    `SELECT o.id FROM "StockOffer" o WHERE o.id LIKE $1 AND o.pieces < (SELECT count(*) FROM "GiftOrder" g WHERE g."offerId"=o.id AND g.status <> 'CANCELLED')`,
    [prefix + "%"],
  );
  if (invalid.rowCount) throw new Error("Demo gift capacity validation failed");
  const badSettlements = await db.query(
    `SELECT s.id FROM "GiftSettlement" s LEFT JOIN "GiftOrder" g ON g."settlementId"=s.id WHERE s.id LIKE $1 GROUP BY s.id HAVING s.amount <> coalesce(sum(g."partnerPrice"),0)`,
    [prefix + "%"],
  );
  if (badSettlements.rowCount) throw new Error("Demo settlement totals do not reconcile");
  await db.query("COMMIT");
  console.log(
    JSON.stringify(
      {
        database: "groupbasket (local)",
        added: additions,
        brandLogin: "brand@example.com",
        brandUsesDemoPassword: await verifyPassword("password123", brand.passwordHash),
        dashboard: "http://localhost:3002/seller",
        products: products.length,
        gifts: orders.length,
        settlements: 2,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await db.query("ROLLBACK");
  throw error;
} finally {
  await db.end();
}
