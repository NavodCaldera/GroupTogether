import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { NewCartForm } from "./new-cart-form";

export const metadata: Metadata = { title: "Start a cart" };

export default async function NewCartPage() {
  await requireUser([], "/carts/new");
  const s = await getSettings();
  return (
    <div className="mx-auto w-full max-w-lg">
      <PageHeader
        title="Start a group cart"
        description={`Together your cart needs to reach ${formatLKR(s.minOrderValue)} within ${s.cartLifetimeHours} hours. You'll be the owner: once it reaches the minimum you pay for the whole cart and receive the delivery.`}
      />
      <Card>
        <NewCartForm />
      </Card>
    </div>
  );
}
