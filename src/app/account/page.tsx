import type { Metadata } from "next";
import { BackLink } from "@/components/client";
import { Alert, Button, PageHeader } from "@/components/ui";
import { signOutAction } from "@/server/auth/actions";
import { homeFor } from "@/server/auth/service";
import { requireUser } from "@/server/auth/session";
import { PackerProfile } from "./packer-profile";
import { ProfileForm } from "./profile-form";
import { SellerProfile } from "./seller-profile";

export const metadata: Metadata = { title: "Profile" };

/** The buyer's details and drop-off point, used for joining carts and for PickMe delivery. */
export default async function ProfilePage({ searchParams }: PageProps<"/account">) {
  const { next } = await searchParams;
  const user = await requireUser([], "/account");
  const back = typeof next === "string" && next.startsWith("/") ? next : undefined;
  // Packing staff have no drop-off address; an admin keeps their details (rule 17).
  if (user.role === "PACKER")
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
        <div>
          <BackLink fallback={homeFor(user.role, user.adminArea)} />
          <PageHeader title="Profile" />
        </div>
        <PackerProfile user={user} />
      </div>
    );
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
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <div>
        <BackLink fallback={homeFor(user.role, user.adminArea)} />
        <PageHeader title="Profile" description={user.email} />
      </div>
      {back && user.lat == null && (
        <Alert tone="info">Pin your address on the map to continue.</Alert>
      )}
      <ProfileForm next={back} defaults={user} />
      <form action={signOutAction} className="border-t border-line pt-4">
        <Button variant="secondary" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}
