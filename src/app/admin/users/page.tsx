import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { Chip, ChipRow, Pager, SearchForm, Table, hrefWith, pageNumber, param } from "../list-bits";

export const metadata: Metadata = { title: "Users" };

const PAGE = 50;
const FILTERS = {
  customers: { role: "CUSTOMER" },
  sellers: { role: "SELLER" },
  admins: { role: "ADMIN" },
  locked: { locked: true },
} satisfies Record<string, Prisma.UserWhereInput>;
type Filter = keyof typeof FILTERS;

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  await requireAdmin();
  const sp = await searchParams;
  const show = (Object.keys(FILTERS) as Filter[]).find((f) => f === param(sp, "show"));
  const q = param(sp, "q");
  const page = pageNumber(sp);

  const rows = await db.user.findMany({
    where: {
      ...(show ? FILTERS[show] : {}),
      OR: q
        ? [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q.replace(/[\s-]/g, "").replace(/^\+94/, "0") } },
            { city: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
          ]
        : undefined,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      city: true,
      company: true,
      role: true,
      locked: true,
      createdAt: true,
      _count: { select: { ownedCarts: true, memberships: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE,
    take: PAGE + 1,
  });
  const users = rows.slice(0, PAGE);
  const href = (values: Record<string, string | number | undefined>) =>
    hrefWith("/admin/users", { show, q, ...values });

  return (
    <>
      <PageHeader
        title="Users"
        description="Buyers sign up themselves. Factory sellers are added here; admins come only from the seed."
        actions={
          <Link
            href="/admin/users/new-seller"
            className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-on-accent hover:opacity-90 sm:min-h-10"
          >
            Add factory seller
          </Link>
        }
      />
      <SearchForm
        action="/admin/users"
        q={q}
        placeholder="Name, company, email, mobile or city"
        keep={{ show }}
      />
      <ChipRow>
        <Chip href={href({ show: undefined })} active={!show}>
          All
        </Chip>
        <Chip href={href({ show: "customers" })} active={show === "customers"}>
          Buyers
        </Chip>
        <Chip href={href({ show: "sellers" })} active={show === "sellers"}>
          Factory sellers
        </Chip>
        <Chip href={href({ show: "admins" })} active={show === "admins"}>
          Admins
        </Chip>
        <Chip href={href({ show: "locked" })} active={show === "locked"}>
          Locked
        </Chip>
      </ChipRow>
      {users.length === 0 ? (
        <EmptyState title={q ? `No users match "${q}"` : "No users"} />
      ) : (
        <Table
          head={
            <>
              <th>Name</th>
              <th>Email</th>
              <th>Mobile</th>
              <th>City</th>
              <th className="text-right">Started</th>
              <th className="text-right">Joined</th>
              <th>Signed up</th>
            </>
          }
        >
          {users.map((u) => (
            <tr key={u.id}>
              <td>
                <Link href={`/admin/users/${u.id}`} className="text-accent underline">
                  {u.name}
                </Link>
                {u.role === "ADMIN" && (
                  <span className="ml-2">
                    <Badge tone="info">Admin</Badge>
                  </span>
                )}
                {u.role === "SELLER" && (
                  <span className="ml-2">
                    <Badge tone="info">Seller · {u.company}</Badge>
                  </span>
                )}
                {u.locked && (
                  <span className="ml-2">
                    <Badge tone="bad">Locked</Badge>
                  </span>
                )}
              </td>
              <td>{u.email}</td>
              <td>{u.phone ?? "—"}</td>
              <td>{u.city ?? "—"}</td>
              <td className="text-right">{u._count.ownedCarts}</td>
              <td className="text-right">{u._count.memberships}</td>
              <td className="text-subtle">{formatDateTime(u.createdAt)}</td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={page} hasNext={rows.length > PAGE} href={(p) => href({ page: p })} />
    </>
  );
}
