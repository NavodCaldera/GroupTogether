import "server-only";

/**
 * Delivery adapter: one PickMe drop per confirmed cart, to the cart owner.
 * The owner (the receiver) pays the driver directly; the platform never charges, collects or
 * refunds a delivery fee. `quotedFee` is only shown to the owner.
 */
export type DropRequest = {
  reference: string;
  recipientName: string;
  recipientPhone: string;
  address: string;
  city: string;
  /** Item count, for the parcel size */
  items: number;
};

export type Booking = {
  externalRef: string | null;
  quotedFee: string | null;
  trackingUrl: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
};

export interface DeliveryProvider {
  readonly name: string;
  /** Books the trip, or for manual mode records what the admin booked in the PickMe app. */
  book(req: DropRequest, manual?: Partial<Booking>): Promise<Booking>;
}

/** The admin books the trip in the PickMe business app and types in the details. */
export class ManualProvider implements DeliveryProvider {
  readonly name = "manual";
  async book(_req: DropRequest, manual: Partial<Booking> = {}): Promise<Booking> {
    return {
      externalRef: manual.externalRef || null,
      quotedFee: manual.quotedFee || null,
      trackingUrl: manual.trackingUrl || null,
      driverName: manual.driverName || null,
      driverPhone: manual.driverPhone || null,
    };
  }
}

/**
 * PickMe business delivery API. PickMe does not publish an open API: the endpoint, fields and
 * auth come with a PickMe business (PickMe Flash) account. Fill in `book` from their docs and
 * set DELIVERY_PROVIDER=pickme with PICKME_API_URL, PICKME_API_KEY and PICKME_MERCHANT_ID.
 */
export class PickMeProvider implements DeliveryProvider {
  readonly name = "pickme";
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly merchantId: string,
  ) {}

  async book(req: DropRequest): Promise<Booking> {
    // ASSUMED request shape: replace with the fields from PickMe's API documentation.
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/deliveries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        merchant_id: this.merchantId,
        reference: req.reference,
        dropoff: {
          name: req.recipientName,
          phone: req.recipientPhone,
          address: req.address,
          city: req.city,
        },
        payment: { collect_from: "receiver" },
        parcel: { items: req.items },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`PickMe booking failed (${res.status}): ${await res.text()}`);
    const body = (await res.json()) as Record<string, unknown>;
    return {
      externalRef: String(body.id ?? body.reference ?? "") || null,
      quotedFee: body.fee != null ? String(body.fee) : null,
      trackingUrl: typeof body.tracking_url === "string" ? body.tracking_url : null,
    };
  }
}

let instance: DeliveryProvider | undefined;

export function deliveryProvider(): DeliveryProvider {
  if (!instance) {
    const { DELIVERY_PROVIDER, PICKME_API_URL, PICKME_API_KEY, PICKME_MERCHANT_ID } = process.env;
    if (DELIVERY_PROVIDER === "pickme") {
      if (!PICKME_API_URL || !PICKME_API_KEY || !PICKME_MERCHANT_ID)
        throw new Error(
          "DELIVERY_PROVIDER=pickme needs PICKME_API_URL, PICKME_API_KEY, PICKME_MERCHANT_ID",
        );
      instance = new PickMeProvider(PICKME_API_URL, PICKME_API_KEY, PICKME_MERCHANT_ID);
    } else {
      instance = new ManualProvider();
    }
  }
  return instance;
}
