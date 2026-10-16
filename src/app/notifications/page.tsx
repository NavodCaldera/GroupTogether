import type { Metadata } from "next";
import Link from "next/link";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { markAllReadAction } from "@/server/carts/actions";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser([], "/notifications");
  const items = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title="Notifications"
        actions={
          items.some((n) => !n.readAt) && (
            <form action={markAllReadAction}>
              <Button variant="secondary">Mark all read</Button>
            </form>
          )
        }
      />
      {items.length === 0 ? (
        <EmptyState title="Nothing yet" />
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {items.map((n) => {
            const body = (
              <>
                <p className={n.readAt ? "font-medium" : "font-semibold"}>
                  {!n.readAt && (
                    <span className="mr-2 inline-block size-2 rounded-full bg-accent" />
                  )}
                  {n.title}
                </p>
                <p className="mt-0.5 text-sm text-subtle">{n.body}</p>
                <p className="mt-1 text-xs text-subtle">{formatDateTime(n.createdAt)}</p>
              </>
            );
            return (
              <li key={n.id}>
                {n.href ? (
                  <Link href={n.href} className="block p-4 hover:bg-muted">
                    {body}
                  </Link>
                ) : (
                  <div className="p-4">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
