import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatLKR } from "@/lib/format";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { myGroups } from "@/server/packs";

const NEXT = {
  OPEN: "Waiting for more families",
  FULL: "Group full. Payment and pickup come next",
  CLOSED: "Closed",
} as const;

export default async function MyGroupsPage() {
  const user = await requireUser([...BUYER_ROLES], "/my-groups");
  const rows = await myGroups(user.id);
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <PageHeader title="My groups" />
      {rows.length === 0 ? (
        <EmptyState title="No groups yet">
          <Link className="underline" href="/packs">
            Family packs
          </Link>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.groupId}>
              <Card className="flex flex-col gap-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <Link className="font-medium underline" href={`/packs/p/${r.packSlug}`}>
                    {r.company} · {r.packName}
                  </Link>
                  <span>{formatLKR(r.price)}</span>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge tone={r.status === "FULL" ? "good" : "info"}>
                    {r.joined} of {r.size} families
                  </Badge>
                  <Badge>{r.pickup}</Badge>
                  {r.closesAt ? <Badge>Closes {formatDate(r.closesAt)}</Badge> : null}
                </div>
                <p className="text-sm">{NEXT[r.status]}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
