/**
 * Demo data for the area-agent model. Every account's password is "password123"; the logins and
 * the identifiers browser specs use are in src/lib/demo-accounts.ts. Resets the database first.
 *
 * Orders, baskets, pickup codes, tokens and the return are made through the real services
 * (checkout, a signed demo payment notice, packing, courier, receiving, handover, returns), so
 * the data passes the same checks the app enforces. Agents apply, are approved and pay their
 * deposit the same way. Factories, products, admins and the luxury brand are written directly.
 *
 *   Admins    one per area: AGENTS, FACTORY, CORE, PREMIUM
 *   Factories Ceylon Apparel Mills and Lanka Knit Works: Owner, Packing and Sales, 6 products each
 *   Agents    Kollupitiya, Wellawatte, Kotahena (LIVE, with hours) and an applicant in Rajagiriya
 *   Baskets   AT_AGENT    Kollupitiya × Ceylon: Dilan's parcel waits (code 246810); Sachini's
 *                         collected blouse is a return AWAITING_HANDOVER
 *             WITH_COURIER Kollupitiya × Lanka: Ravindu and Ayesha
 *             LOCKED      Wellawatte × Ceylon: Tharindu and Nimali, for Packing to pack
 *             PACKED      Kotahena × Ceylon: Sachini, for the admin to book a courier
 *             OPEN        Wellawatte × Lanka: Nimali (Tharindu cancelled his order: his tokens)
 *             OPEN        Kollupitiya × Ceylon: Ravindu
 *
 * Runs with prisma/seed-hooks.mjs preloaded (prisma.config.ts) so the server modules load.
 */
import "dotenv/config";
import { D } from "../src/lib/decimal";
import { findKind } from "../src/lib/taxonomy";
import type { Hours } from "../src/lib/agent-rules";
import {
  DEMO_ADMINS,
  DEMO_AGENTS,
  DEMO_BUYERS,
  DEMO_FACTORIES,
  DEMO_PASSWORD,
  DEMO_PICKUP_CODE,
} from "../src/lib/demo-accounts";
import { db } from "../src/server/db";
import { hashPassword } from "../src/server/auth/password";
import { setCartItem } from "../src/server/orders/cart";
import { startCheckout } from "../src/server/orders/checkout";
import { cancelOrder } from "../src/server/orders/baskets";
import {
  bookCourier,
  givenToDriver,
  markBasketReceived,
  markPacked,
} from "../src/server/orders/delivery";
import { handOver } from "../src/server/orders/handover";
import { applyAsAgent } from "../src/server/agents/apply";
import { decideAgent } from "../src/server/agents/admin";
import { startDeposit } from "../src/server/agents/deposit";
import { setHours } from "../src/server/agents/hours";
import { factoryDecide, fileReturn } from "../src/server/returns";
import { handleNotice } from "../src/server/payments/notice";
import { signNotice } from "../src/server/payments/demo";

// Payments go through the demo gateway's signed notice, in this process only.
process.env.PAYMENT_GATEWAY = "demo";
process.env.DEMO_MERCHANT_ID ||= "seed-merchant";
process.env.DEMO_MERCHANT_SECRET ||= "seed-secret";

const COMMISSION = "100";
const STOCK_PER_SIZE = 40;

type ProductSeed = {
  title: string;
  kind: string;
  audience: "MEN" | "WOMEN" | "BOY";
  stockType: "FACTORY_SURPLUS" | "B_GRADE";
  factoryPrice: string;
  retail: string;
  description: string;
};

const CEYLON_PRODUCTS: ProductSeed[] = [
  {
    title: "Oxford button-down shirt",
    kind: "men-shirts",
    audience: "MEN",
    stockType: "FACTORY_SURPLUS",
    factoryPrice: "3500",
    retail: "7900",
    description: "Cotton oxford, regular fit.",
  },
  {
    title: "Slim chino",
    kind: "men-trousers",
    audience: "MEN",
    stockType: "FACTORY_SURPLUS",
    factoryPrice: "3000",
    retail: "8500",
    description: "Stretch cotton twill.",
  },
  {
    title: "Crew-neck cotton tee (3-pack)",
    kind: "men-tshirts",
    audience: "MEN",
    stockType: "FACTORY_SURPLUS",
    factoryPrice: "2300",
    retail: "5400",
    description: "100% cotton, 180 gsm. Overrun from an export order.",
  },
  {
    title: "Linen short-sleeve shirt",
    kind: "men-shirts",
    audience: "MEN",
    stockType: "FACTORY_SURPLUS",
    factoryPrice: "2050",
    retail: "4900",
    description: "Washed linen, short sleeves.",
  },
  {
    title: "Cotton blouse",
    kind: "women-tops",
    audience: "WOMEN",
    stockType: "FACTORY_SURPLUS",
    factoryPrice: "3100",
    retail: "6500",
    description: "Cotton blouse, relaxed fit.",
  },
  {
    title: "Linen summer dress",
    kind: "women-dresses",
    audience: "WOMEN",
    stockType: "FACTORY_SURPLUS",
    factoryPrice: "4100",
    retail: "9800",
    description: "Linen-cotton blend.",
  },
];

const LANKA_PRODUCTS: ProductSeed[] = [
  {
    title: "Hooded sweatshirt",
    kind: "men-jackets",
    audience: "MEN",
    stockType: "FACTORY_SURPLUS",
    factoryPrice: "3500",
    retail: "8200",
    description: "Brushed fleece, kangaroo pocket.",
  },
  {
    title: "Track pants",
    kind: "men-trousers",
    audience: "MEN",
    stockType: "FACTORY_SURPLUS",
    factoryPrice: "2800",
    retail: "6500",
    description: "Tapered, zip pockets.",
  },
  {
    title: "Polo shirt",
    kind: "men-tshirts",
    audience: "MEN",
    stockType: "B_GRADE",
    factoryPrice: "1600",
    retail: "4900",
    description: "Piqué cotton. Cosmetic seconds.",
  },
  {
    title: "Running shorts",
    kind: "men-shorts",
    audience: "MEN",
    stockType: "FACTORY_SURPLUS",
    factoryPrice: "1500",
    retail: "3900",
    description: "Quick-dry, inner brief.",
  },
  {
    title: "Denim jacket",
    kind: "women-jackets",
    audience: "WOMEN",
    stockType: "B_GRADE",
    factoryPrice: "4400",
    retail: "12500",
    description: "12 oz denim, classic fit.",
  },
  {
    title: "School uniform shirt",
    kind: "boy-tshirts",
    audience: "BOY",
    stockType: "FACTORY_SURPLUS",
    factoryPrice: "3800",
    retail: "7200",
    description: "White school uniform shirt.",
  },
];

/** A 1×1 PNG for the agents' NIC, own and storage photos (private storage). */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=",
  "base64",
);
const png = (name: string) => new File([PNG], name, { type: "image/png" });

const WEEKDAYS = [1, 2, 3, 4, 5];
const hm = (h: number, m = 0) => h * 60 + m;

async function resetDatabase() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length)
    await db.$executeRawUnsafe(
      `TRUNCATE TABLE ${tables.map((t) => `"public"."${t.tablename}"`).join(", ")} CASCADE`,
    );
}

let paymentNo = 0;
/** Pays a gateway attempt with a signed SUCCEEDED notice, as the demo payment page does. */
async function payAttempt(attemptId: string) {
  const attempt = await db.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  const fields = {
    merchant_id: process.env.DEMO_MERCHANT_ID!,
    order_id: attempt.id,
    payment_id: `seed-pay-${++paymentNo}`,
    payhere_amount: new D(attempt.amount.toString()).toFixed(2),
    payhere_currency: attempt.currency,
    status_code: "2",
  };
  const raw = new URLSearchParams({
    ...fields,
    md5sig: signNotice(fields, process.env.DEMO_MERCHANT_SECRET!),
  }).toString();
  const { status } = await handleNotice(raw, new Headers());
  const after = await db.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  if (status !== 200 || after.status !== "SUCCEEDED")
    throw new Error(`seed: payment ${attemptId} was not applied (${after.status})`);
}

let checkoutNo = 0;
/** The buyer fills the cart, checks out at the agent and pays. Returns the new order ids. */
async function buy(
  buyerId: string,
  agentId: string,
  items: [variantId: string, qty: number][],
): Promise<string[]> {
  for (const [variantId, qty] of items) await setCartItem(buyerId, variantId, qty);
  const out = await startCheckout(buyerId, {
    agentId,
    tokens: "0",
    requestKey: `seed-checkout-${++checkoutNo}`,
  });
  if (out.attemptId) await payAttempt(out.attemptId);
  return out.orderIds;
}

async function main() {
  await resetDatabase();

  await db.settings.create({ data: { id: 1 } });

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // ─── Admins: one per area (ADMIN-001/002); there is no unrestricted admin ──
  await db.user.createMany({
    data: (
      [
        ["Luxury Brand Admin", DEMO_ADMINS.PREMIUM, "0700000001", "PREMIUM"],
        ["Factory Admin", DEMO_ADMINS.FACTORY, "0700000002", "FACTORY"],
        ["Agents Admin", DEMO_ADMINS.AGENTS, "0700000003", "AGENTS"],
        ["Core Admin", DEMO_ADMINS.CORE, "0700000004", "CORE"],
      ] as const
    ).map(([name, email, phone, adminArea]) => ({
      role: "ADMIN" as const,
      adminArea,
      name,
      email,
      phone,
      passwordHash,
    })),
  });
  const core = await db.user.findUniqueOrThrow({ where: { email: DEMO_ADMINS.CORE } });
  const agentsAdmin = await db.user.findUniqueOrThrow({ where: { email: DEMO_ADMINS.AGENTS } });
  await db.agreementVersion.create({
    data: { version: 1, text: "Agreement text supplied by GroupBasket", publishedBy: core.id },
  });

  // ─── Factories: the owner account, Packing and Sales staff, 6 live products each ──
  async function factory(
    f: { company: string; owner: string; packing: string; sales: string },
    people: { owner: string; packing: string; sales: string },
    place: { address: string; city: string; lat: number; lng: number },
    phones: [string, string, string],
    products: ProductSeed[],
  ) {
    const owner = await db.user.create({
      data: {
        role: "SELLER",
        name: people.owner,
        company: f.company,
        email: f.owner,
        phone: phones[0],
        ...place,
        passwordHash,
      },
    });
    await db.factoryProfile.create({
      data: {
        factoryUserId: owner.id,
        status: "ACTIVE",
        complianceDueAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    const staff = async (name: string, email: string, phone: string, job: "PACKING" | "SALES") =>
      db.user.create({
        data: {
          role: "SELLER",
          factoryId: owner.id,
          factoryRole: job,
          name,
          email,
          phone,
          company: f.company,
          city: place.city,
          passwordHash,
        },
      });
    const packing = await staff(people.packing, f.packing, phones[1], "PACKING");
    const sales = await staff(people.sales, f.sales, phones[2], "SALES");
    // variants[product][size]
    const variants: string[][] = [];
    for (const p of products) {
      const kind = findKind(p.kind)!;
      const product = await db.product.create({
        data: {
          title: p.title,
          brand: f.company,
          category: kind.category,
          audience: p.audience,
          kind: p.kind,
          stockType: p.stockType,
          factoryPrice: p.factoryPrice,
          commission: COMMISSION,
          price: new D(p.factoryPrice).plus(COMMISSION).toFixed(2),
          retailPrice: p.retail,
          description: p.description,
          status: "LIVE",
          sellerId: owner.id,
          variants: {
            create: kind.sizes.slice(0, 4).map((size) => ({ size, available: STOCK_PER_SIZE })),
          },
        },
        include: { variants: { orderBy: { id: "asc" } } },
      });
      variants.push(
        kind.sizes.slice(0, 4).map((size) => product.variants.find((v) => v.size === size)!.id),
      );
    }
    return { owner, packing, sales, variants };
  }

  const ceylon = await factory(
    DEMO_FACTORIES.ceylon,
    { owner: "Nuwan Rajapaksha", packing: "Ruwan Perera", sales: "Chamari Fernando" },
    {
      address: "42 Factory Road, Ekala Industrial Estate",
      city: "Ja-Ela",
      lat: 7.0827,
      lng: 79.9021,
    },
    ["0776666666", "0776666601", "0776666602"],
    CEYLON_PRODUCTS,
  );
  const lanka = await factory(
    DEMO_FACTORIES.lanka,
    { owner: "Pradeep Gamage", packing: "Lahiru Dissanayake", sales: "Dinusha Herath" },
    { address: "7 Zone 2, Biyagama Export Zone", city: "Biyagama", lat: 6.9446, lng: 79.9895 },
    ["0765555501", "0765555502", "0765555503"],
    LANKA_PRODUCTS,
  );

  // ─── Buyers ──
  const person = (
    name: string,
    email: string,
    phone: string,
    address: string,
    city: string,
    lat: number,
    lng: number,
  ) => db.user.create({ data: { name, email, phone, address, city, lat, lng, passwordHash } });
  const dilan = await person(
    "Dilan Wickramasinghe",
    DEMO_BUYERS.dilan,
    "0777777777",
    "12 Charles Drive",
    "Colombo 03",
    6.908,
    79.856,
  );
  const sachini = await person(
    "Sachini Gunawardena",
    DEMO_BUYERS.sachini,
    "0778888888",
    "14 Flower Terrace",
    "Colombo 07",
    6.9105,
    79.8637,
  );
  const tharindu = await person(
    "Tharindu Senanayake",
    DEMO_BUYERS.tharindu,
    "0779999999",
    "5 Hampden Lane",
    "Colombo 06",
    6.8772,
    79.8618,
  );
  const nimali = await person(
    "Nimali Jayasuriya",
    DEMO_BUYERS.nimali,
    "0771111004",
    "33 Fussels Lane",
    "Colombo 06",
    6.8721,
    79.8592,
  );
  const ravindu = await person(
    "Ravindu Bandara",
    DEMO_BUYERS.ravindu,
    "0771111005",
    "8 Alfred Place",
    "Colombo 03",
    6.9071,
    79.8531,
  );
  const ayesha = await person(
    "Ayesha Nazeer",
    DEMO_BUYERS.ayesha,
    "0771111006",
    "21 Sea Street",
    "Colombo 11",
    6.9389,
    79.8506,
  );

  // ─── Agents: apply, approval (the 2 km gap check), deposit through the gateway, hours ──
  async function agent(
    name: string,
    email: string,
    phone: string,
    pin: { address: string; city: string; lat: number; lng: number },
    hours: Hours | null,
  ) {
    const user = await db.user.create({ data: { name, email, phone, ...pin, passwordHash } });
    const fd = new FormData();
    fd.set("address", pin.address);
    fd.set("city", pin.city);
    fd.set("lat", String(pin.lat));
    fd.set("lng", String(pin.lng));
    fd.set("nic", png("nic.png"));
    fd.set("photo", png("photo.png"));
    fd.append("storagePhotos", png("storage-1.png"));
    fd.append("storagePhotos", png("storage-2.png"));
    await applyAsAgent(user.id, fd);
    const row = await db.agent.findUniqueOrThrow({ where: { userId: user.id } });
    if (!hours) return { user, id: row.id };
    await decideAgent(agentsAdmin.id, row.id, true, "");
    // Hours come before the deposit (FR-029a).
    await setHours(user.id, hours);
    await startDeposit(user.id);
    const deposit = await db.paymentAttempt.findFirstOrThrow({
      where: { agentId: row.id, purpose: "DEPOSIT", status: "PENDING" },
    });
    await payAttempt(deposit.id);
    return { user, id: row.id };
  }
  const kollupitiya = await agent(
    "Kamal Perera",
    DEMO_AGENTS.kollupitiya,
    "0752222201",
    { address: "118 Galle Road, Kollupitiya", city: "Colombo 03", lat: 6.9115, lng: 79.8505 },
    [
      ...WEEKDAYS.map((weekday) => ({ weekday, opensAt: hm(9), closesAt: hm(20) })),
      { weekday: 6, opensAt: hm(9), closesAt: hm(20) },
      { weekday: 0, opensAt: hm(10), closesAt: hm(14) },
    ],
  );
  const wellawatte = await agent(
    "Fathima Rizwan",
    DEMO_AGENTS.wellawatte,
    "0752222202",
    { address: "402 Galle Road, Wellawatte", city: "Colombo 06", lat: 6.8747, lng: 79.8605 },
    [
      ...WEEKDAYS.map((weekday) => ({ weekday, opensAt: hm(8, 30), closesAt: hm(18) })),
      { weekday: 6, opensAt: hm(9), closesAt: hm(13) },
    ],
  );
  const kotahena = await agent(
    "Suresh Kumar",
    DEMO_AGENTS.kotahena,
    "0752222203",
    { address: "56 George R. de Silva Mawatha", city: "Colombo 13", lat: 6.9442, lng: 79.8597 },
    [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensAt: hm(7), closesAt: hm(21) })),
  );
  await agent(
    "Ishani Silva",
    DEMO_AGENTS.applicant,
    "0752222204",
    { address: "25 Parliament Road, Rajagiriya", city: "Rajagiriya", lat: 6.9097, lng: 79.8946 },
    null,
  );

  const basketOf = async (agentId: string, factoryId: string, status: "OPEN" | "LOCKED") =>
    db.basket.findFirstOrThrow({ where: { agentId, factoryId, status } });
  const C = ceylon.variants;
  const L = lanka.variants;

  // ─── AT_AGENT: Kollupitiya × Ceylon. Sachini's blouses, then Dilan's order locks it ──
  await buy(sachini.id, kollupitiya.id, [[C[4][1], 2]]);
  await buy(dilan.id, kollupitiya.id, [
    [C[0][1], 8],
    [C[1][2], 6],
  ]);
  const atAgent = await basketOf(kollupitiya.id, ceylon.owner.id, "LOCKED");
  await markPacked(ceylon.packing.id, atAgent.id);
  await bookCourier(agentsAdmin.id, atAgent.id, {
    fee: "1500",
    driverName: "Nimal Silva",
    driverPhone: "0771234567",
    vehicleNo: "CAB-4521",
  });
  await givenToDriver(ceylon.packing.id, atAgent.id);
  // Dilan's code is fixed so the agent spec can type it; receiving keeps an existing code.
  await db.pickupCode.create({
    data: { buyerId: dilan.id, agentId: kollupitiya.id, code: DEMO_PICKUP_CODE },
  });
  await markBasketReceived(kollupitiya.user.id, atAgent.id, []);
  // Sachini collects her blouses and returns one (too small): the factory accepts.
  const sachiniCode = await db.pickupCode.findUniqueOrThrow({
    where: { buyerId_agentId: { buyerId: sachini.id, agentId: kollupitiya.id } },
  });
  const blouse = await db.orderLine.findFirstOrThrow({
    where: { order: { buyerId: sachini.id, basketId: atAgent.id } },
  });
  await handOver(kollupitiya.user.id, sachiniCode.code, [blouse.id]);
  const filed = await fileReturn(sachini.id, blouse.id, {
    reason: "SIZE",
    fault: "BUYER",
    note: "Too small",
    photos: [],
    qty: 1,
  });
  await factoryDecide(ceylon.sales.id, filed.id, true);

  // ─── WITH_COURIER: Kollupitiya × Lanka. Ravindu and Ayesha; on its way to the agent ──
  await buy(ravindu.id, kollupitiya.id, [[L[0][2], 7]]);
  await buy(ayesha.id, kollupitiya.id, [[L[4][1], 6]]);
  const withCourier = await basketOf(kollupitiya.id, lanka.owner.id, "LOCKED");
  await markPacked(lanka.packing.id, withCourier.id);
  await bookCourier(agentsAdmin.id, withCourier.id, {
    fee: "1200",
    driverName: "Sunil Fernando",
    driverPhone: "0712345678",
    vehicleNo: "WP-KX-7781",
  });
  await givenToDriver(lanka.packing.id, withCourier.id);

  // ─── LOCKED: Wellawatte × Ceylon. Tharindu and Nimali; Packing still has to pack it ──
  await buy(tharindu.id, wellawatte.id, [[C[5][0], 5]]);
  await buy(nimali.id, wellawatte.id, [[C[2][1], 13]]);
  await basketOf(wellawatte.id, ceylon.owner.id, "LOCKED");

  // ─── PACKED: Kotahena × Ceylon. Sachini's shirts; the admin has to book a courier ──
  await buy(sachini.id, kotahena.id, [[C[0][2], 14]]);
  const packed = await basketOf(kotahena.id, ceylon.owner.id, "LOCKED");
  await markPacked(ceylon.packing.id, packed.id);

  // ─── OPEN: Wellawatte × Lanka. Nimali's polos; Tharindu cancels his shorts for tokens ──
  await buy(nimali.id, wellawatte.id, [[L[2][1], 3]]);
  const [shorts] = await buy(tharindu.id, wellawatte.id, [[L[3][2], 4]]);
  await cancelOrder(tharindu.id, shorts);
  await basketOf(wellawatte.id, lanka.owner.id, "OPEN");

  // ─── OPEN: Kollupitiya × Ceylon. Ravindu starts the next basket ──
  await buy(ravindu.id, kollupitiya.id, [[C[3][3], 2]]);
  await basketOf(kollupitiya.id, ceylon.owner.id, "OPEN");

  // ─── A luxury brand (product owner, 2026-10-24): fictional, on a reserved .example domain ──
  // Brands are parked, not removed: its live product and two submissions stay.
  const DAY = 86_400_000;
  const daysAgo = (d: number) => new Date(Date.now() - d * DAY);
  const brand = await db.user.create({
    data: {
      role: "SELLER",
      isBrand: true,
      name: "Amaya Jayawardena",
      company: "Serendib Atelier",
      website: "https://www.serendib-atelier.example",
      email: "brand@example.com",
      phone: "0765555555",
      address: "18 Flower Road",
      city: "Colombo 07",
      lat: 6.9105,
      lng: 79.8577,
      passwordHash,
    },
  });
  const kaftanUrl = "https://www.serendib-atelier.example/products/linen-kaftan";
  const kaftan = await db.product.create({
    data: {
      title: "Hand-loomed linen kaftan",
      brand: "Serendib Atelier",
      category: "APPAREL",
      audience: "WOMEN",
      kind: "women-dresses",
      stockType: "FACTORY_SURPLUS",
      price: "11900",
      retailPrice: "18500",
      brandUrl: kaftanUrl,
      description: "Natural linen, hand-loomed. Last season's colours.",
      status: "LIVE",
      sellerId: brand.id,
      createdAt: daysAgo(3),
      variants: {
        create: [
          { size: "S", available: 12 },
          { size: "M", available: 14 },
          { size: "L", available: 10 },
        ],
      },
    },
  });
  for (const o of [
    {
      name: "Hand-loomed linen kaftan",
      description: "Natural linen, S to L. Last season's colours.",
      actualPrice: "18500",
      offerPrice: "9800",
      pieces: 36,
      productUrl: kaftanUrl,
      accepted: true,
      ago: 5,
    },
    {
      name: "Embroidered cotton blouse",
      description: "Hand embroidery, S to XL, ivory and sage.",
      actualPrice: "12900",
      offerPrice: "6500",
      pieces: 60,
      productUrl: "https://www.serendib-atelier.example/products/embroidered-blouse",
      accepted: false,
      ago: 0.2,
    },
  ])
    await db.stockOffer.create({
      data: {
        sellerId: brand.id,
        name: o.name,
        description: o.description,
        actualPrice: o.actualPrice,
        offerPrice: o.offerPrice,
        pieces: o.pieces,
        productUrl: o.productUrl,
        amount: new D(o.offerPrice).times(o.pieces).toFixed(2),
        status: o.accepted ? "ACCEPTED" : "IN_REVIEW",
        productId: o.accepted ? kaftan.id : null,
        createdAt: daysAgo(o.ago),
        decidedAt: o.accepted ? daysAgo(o.ago - 1) : null,
        receivedAt: o.accepted ? daysAgo(3) : null,
      },
    });

  // Seeded brand submissions use the same review history as newly submitted products.
  for (const offer of await db.stockOffer.findMany({ where: { sellerId: brand.id } })) {
    await db.brandOfferRevision.create({
      data: {
        offerId: offer.id,
        version: 1,
        status: offer.status,
        submittedById: brand.id,
        reviewedAt: offer.decidedAt,
        createdAt: offer.createdAt,
        snapshot: {
          name: offer.name,
          description: offer.description,
          actualPrice: offer.actualPrice?.toString() ?? null,
          offerPrice: offer.offerPrice?.toString() ?? null,
          pieces: offer.pieces,
          productUrl: offer.productUrl,
          photoKey: offer.photoKey,
          photoType: offer.photoType,
          packDetails: offer.packDetails,
          packSize: offer.packSize,
          dispatchDays: offer.dispatchDays,
          hasExpiry: offer.hasExpiry,
          expiryDate: offer.expiryDate?.toISOString() ?? null,
          minShelfLifeDays: offer.minShelfLifeDays,
        },
      },
    });
    if (offer.status === "ACCEPTED")
      await db.stockOffer.update({ where: { id: offer.id }, data: { approvedRevision: 1 } });
  }

  console.log(`Seeded. Every password is ${DEMO_PASSWORD}; logins are in src/lib/demo-accounts.ts.
  Ready to collect: ${DEMO_BUYERS.dilan} at ${DEMO_AGENTS.kollupitiya}, code ${DEMO_PICKUP_CODE}
  Return to hand over: ${DEMO_BUYERS.sachini} at ${DEMO_AGENTS.kollupitiya}
  Tokens: ${DEMO_BUYERS.tharindu}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
