import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/client";
import { Alert, Card, PageHeader } from "@/components/ui";
import { activeCartOf } from "@/server/carts/queries";
import { requireUser } from "@/server/auth/session";
import { NewCartForm } from "./new-cart-form";

export const metadata: Metadata = { title: "Start a cart" };

export default async function NewCartPage() {
  const user = await requireUser([], "/carts/new");
  const active = await activeCartOf(user.id);
  return (
    <div className="mx-auto w-full max-w-lg">
      <BackLink fallback="/carts" />
      <PageHeader title="Start a group cart" />
      {active ? (
        <Alert tone="info">
          You already have an active cart, <strong>{active.name || active.code}</strong>. You can be
          in one cart at a time, so finish it, leave it or cancel it first.{" "}
          <Link href={`/c/${active.code}`} className="font-medium underline">
            Go to your cart
          </Link>
        </Alert>
      ) : (
        <Card>
          <NewCartForm />
        </Card>
      )}
    </div>
  );
}
