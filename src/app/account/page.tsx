import type { Metadata } from "next";
import { BackLink } from "@/components/client";
import { Alert, PageHeader } from "@/components/ui";
import { signOutAction } from "@/server/auth/actions";
import { requireUser } from "@/server/auth/session";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage({ searchParams }: PageProps<"/account">) {
  const { next } = await searchParams;
  const user = await requireUser("/account");
  const back = typeof next === "string" && next.startsWith("/") ? next : undefined;
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <div>
        <BackLink fallback="/" />
        <PageHeader title="Profile" description={user.email} />
      </div>
      {back && user.lat == null && (
        <Alert tone="info">Pin your address on the map to continue.</Alert>
      )}
      <ProfileForm next={back} defaults={user} />
      <form action={signOutAction}>
        <button
          type="submit"
          className="min-h-12 w-full rounded-xl border border-line bg-paper px-4 text-left font-medium text-danger transition hover:bg-muted"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
