import Link from "next/link";
import { db } from "@/server/db";
import { tokenBalance } from "@/server/tokens";
import { formatLKR, formatDateTime } from "@/lib/format";
import { Card } from "@/components/ui";
import type { Metadata } from "next";
import { BackLink } from "@/components/client";
import { Alert, Button, PageHeader } from "@/components/ui";
import { signOutAction } from "@/server/auth/actions";
import { homeFor } from "@/server/auth/service";
import { isBuyerRole } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { ProfileForm } from "./profile-form";
import { SellerProfile } from "./seller-profile";

export const metadata: Metadata = { title: "Profile" };

/** The buyer's details and drop-off point, used for joining carts and for PickMe delivery. */
export default async function ProfilePage({ searchParams }: PageProps<"/account">) {
  const { next, before } = await searchParams;
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
  const balance = isBuyerRole(user.role) ? await tokenBalance(user.id) : null;
  // Cursor is constrained to this principal; never use an arbitrary other user's ledger entry.
  const cursor =
    typeof before === "string"
      ? await db.tokenEntry.findFirst({
          where: { id: before, userId: user.id },
          select: { id: true, createdAt: true },
        })
      : null;
  const entries =
    balance !== null
      ? await db.tokenEntry.findMany({
          where: {
            userId: user.id,
            ...(cursor
              ? {
                  OR: [
                    { createdAt: { lt: cursor.createdAt } },
                    { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                  ],
                }
              : {}),
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 51,
          select: { id: true, amount: true, kind: true, note: true, createdAt: true },
        })
      : [];
  const page = entries.slice(0, 50);
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
      {balance !== null && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Tokens</h2>
          <p>
            Balance: <strong>{formatLKR(balance)}</strong>
          </p>
          <ul className="divide-y divide-line">
            {page.map((entry) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-1 py-2 text-sm">
                <span>{entry.kind.toLowerCase()}</span>
                <strong>{formatLKR(entry.amount)}</strong>
                <span className="basis-full break-words text-subtle">{entry.note}</span>
                <time dateTime={entry.createdAt.toISOString()} className="text-xs text-subtle">
                  {formatDateTime(entry.createdAt)}
                </time>
              </li>
            ))}
          </ul>
          {entries.length > 50 && (
            <Link className="underline" href={`/account?before=${page[49].id}`}>
              Older token entries
            </Link>
          )}
          {cursor && (
            <Link className="underline" href="/account">
              Latest token entries
            </Link>
          )}
        </Card>
      )}
      <form action={signOutAction} className="border-t border-line pt-4">
        <Button variant="secondary" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}
