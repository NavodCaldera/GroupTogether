import { Button, Card } from "@/components/ui";
import { signOutAction } from "@/server/auth/actions";
import type { SessionUser } from "@/server/auth/service";
import { db } from "@/server/db";
import { ProfileForm } from "./profile-form";

/**
 * Profile for factory sellers (rule 11): their company and email, then their name, mobile and
 * factory address with an exact map pin (product owner, 2026-10-20), which the admin sees on
 * their stock offers. Sellers never join carts.
 */
export async function SellerProfile({ user }: { user: SessionUser }) {
  const { company } = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { company: true },
  });
  return (
    <>
      <Card>
        <p className="text-lg font-semibold">{company || user.name}</p>
        <p className="text-sm text-subtle">{user.email}</p>
      </Card>
      <Card>
        <ProfileForm
          defaults={user}
          phoneHint="We call this number about your offers"
          addressLabel="Factory address"
          addressHint="Where your stock is; pin it on the map"
        />
      </Card>
      <form action={signOutAction} className="border-t border-line pt-4">
        <Button variant="secondary" className="w-full">
          Sign out
        </Button>
      </form>
    </>
  );
}
