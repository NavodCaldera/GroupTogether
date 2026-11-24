import type { Metadata } from "next";
import { BackLink } from "@/components/client";
import { ActionForm } from "@/components/resale-forms";
import { Alert, Input, LinkButton, PageHeader } from "@/components/ui";
import { signOutAction } from "@/server/auth/actions";
import { requireUser } from "@/server/auth/session";
import { listContacts } from "@/server/resale";
import { addContactAction, removeContactAction } from "@/server/resale-actions";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage({ searchParams }: PageProps<"/account">) {
  const { next } = await searchParams;
  const user = await requireUser("/account");
  const back = typeof next === "string" && next.startsWith("/") ? next : undefined;
  const contacts = await listContacts(user.id);
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <div>
        <BackLink fallback="/" />
        <PageHeader
          title="Profile"
          description={user.email}
          actions={
            user.companyId ? null : (
              <LinkButton variant="secondary" href="/purchases">
                Purchase history
              </LinkButton>
            )
          }
        />
      </div>
      {back && user.lat == null && (
        <Alert tone="info">Pin your address on the map to continue.</Alert>
      )}
      <ProfileForm next={back} defaults={user} />
      <section aria-labelledby="contacts" className="flex flex-col gap-3">
        <h2 id="contacts" className="text-lg font-semibold">
          Contacts
        </h2>
        <ul className="flex flex-col gap-2">
          {contacts.map((c) => (
            <li key={c.phone} className="flex items-center justify-between gap-2 text-sm">
              {c.phone}
              <ActionForm
                act={removeContactAction}
                fields={{ phone: c.phone }}
                label="Remove"
                variant="ghost"
              />
            </li>
          ))}
        </ul>
        <ActionForm
          act={addContactAction}
          fields={{}}
          label="Add contact"
          variant="secondary"
          className="flex flex-col gap-2"
        >
          <Input
            id="contact-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            aria-label="Contact mobile number"
            required
          />
        </ActionForm>
      </section>
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
