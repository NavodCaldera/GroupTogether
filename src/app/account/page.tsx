import type { Metadata } from "next";
import { BackLink } from "@/components/client";
import { Alert, Button, PageHeader } from "@/components/ui";
import { signOutAction } from "@/server/auth/actions";
import { requireUser } from "@/server/auth/session";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile" };

/** The buyer's details and drop-off point, used for joining carts and for PickMe delivery. */
export default async function ProfilePage({ searchParams }: PageProps<"/account">) {
  const { next } = await searchParams;
  const user = await requireUser([], "/account");
  const back = typeof next === "string" && next.startsWith("/") ? next : undefined;
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <div>
        <BackLink fallback="/dashboard" />
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
