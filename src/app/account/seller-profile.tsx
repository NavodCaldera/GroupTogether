import { Button, Card, LinkButton } from "@/components/ui";
import { signOutAction } from "@/server/auth/actions";
import type { SessionUser } from "@/server/auth/service";
import { db } from "@/server/db";

/**
 * Profile for factory sellers (rule 11): their company and contact details, and sign out. No
 * address or map pin: sellers never join carts. An admin keeps these details.
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
        <dl className="mt-3 divide-y divide-line border-t border-line text-sm">
          {[
            ["Name", user.name],
            ["Email", user.email],
            ["Mobile", user.phone ?? "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 py-3">
              <dt className="text-subtle">{k}</dt>
              <dd className="min-w-0 truncate">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <LinkButton href="/seller">My products</LinkButton>
      <form action={signOutAction} className="border-t border-line pt-4">
        <Button variant="secondary" className="w-full">
          Sign out
        </Button>
      </form>
    </>
  );
}
