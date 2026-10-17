import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";

/**
 * Opening a notification: marks it read, then goes to its page. The list links here with a plain
 * <a> (not next/link), so prefetching never marks anything read.
 */
export async function GET(req: Request, { params }: RouteContext<"/notifications/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in?next=/notifications", req.url));
  const n = await db.notification.findFirst({
    where: { id, userId: user.id },
    select: { href: true, readAt: true },
  });
  if (n && !n.readAt) await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  // Only ever a same-site path.
  const href = n?.href;
  const to =
    href && href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\")
      ? href
      : "/notifications";
  return NextResponse.redirect(new URL(to, req.url), 303);
}
