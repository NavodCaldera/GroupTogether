import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/client";
import { Alert, PageHeader } from "@/components/ui";
import { isBuyerRole } from "@/lib/roles";
import { signOutAction } from "@/server/auth/actions";
import { homeFor } from "@/server/auth/service";
import { requireUser } from "@/server/auth/session";
import { ProfileForm } from "./profile-form";
import { SellerProfile } from "./seller-profile";

export const metadata: Metadata = { title: "Profile" };

const rowClass =
  "flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left font-medium transition hover:bg-muted";

/** The buyer's details and map pin, used to find agents near them. Tokens have their own tab. */
export default async function ProfilePage({ searchParams }: PageProps<"/account">) {
  const { next } = await searchParams;
  const user = await requireUser([], "/account");
  const back = typeof next === "string" && next.startsWith("/") ? next : undefined;
  // Factory sellers never join carts, so no address or map pin either (rule 11).
  if (user.role === "SELLER")
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
        <div>
          <BackLink fallback="/seller" />
          <PageHeader title="Profile" />
        </div>
        <SellerProfile user={user} />
      </div>
    );
  const buyer = isBuyerRole(user.role);
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <div>
        <BackLink fallback={homeFor(user.role, user.adminArea)} />
        <PageHeader title="Profile" description={user.email} />
      </div>
      {back && user.lat == null && (
        <Alert tone="info">Pin your address on the map to continue.</Alert>
      )}
      <ProfileForm next={back} defaults={user} aboutYou={buyer} />
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
        {buyer && (
          <Link href="/account/fit" className={rowClass}>
            My measurements
            <span aria-hidden className="text-subtle">
              ›
            </span>
          </Link>
        )}
        <form action={signOutAction}>
          <button type="submit" className={`${rowClass} text-danger`}>
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
