import { handleNotice } from "@/server/payments/notice";

/** Gateway server notice. The signature on the raw body is the only authentication. */
export async function POST(req: Request) {
  const raw = await req.text();
  try {
    const { status } = await handleNotice(raw, req.headers);
    return new Response(null, { status });
  } catch (error) {
    // Nothing was committed; the gateway retries.
    console.error("Payment notice failed", error);
    return new Response(null, { status: 500 });
  }
}
