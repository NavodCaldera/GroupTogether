import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/cart-bits";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { type CartStatus, STATUS_LABEL, isEditable } from "@/lib/cart-rules";
import { formatDateTime, formatLKR, timeLeft } from "@/lib/format";
import { requireAdmin } from "@/server/auth/session";
import { sweep } from "@/server/carts/service";
import { db } from "@/server/db";
import {
  Chip,
  ChipRow,
  Count,
  Pager,
  SearchForm,
  Table,
  hrefWith,
  pageNumber,
  param,
} from "../list-bits";
import { FilterSelect } from "../filter-select";

export const metadata: Metadata = { title: "Carts" };

const STATUSES = Object.keys(STATUS_LABEL) as CartStatus[];
const PAGE = 50;

export default async function AdminCartsPage({ searchParams }: PageProps<"/admin/carts">) {
  await requireAdmin();
  await sweep();
  const sp = await searchParams;
  const filter = STATUSES.find((s) => s === param(sp, "status"));
  const q = param(sp, "q");
  const page = pageNumber(sp);

  const search: Prisma.GroupCartWhereInput | undefined = q
    ? {
        OR: [
          { code: q.toUpperCase() },
          { name: { contains: q, mode: "insensitive" } },
          { owner: { name: { contains: q, mode: "insensitive" } } },
          { owner: { email: { contains: q, mode: "insensitive" } } },
          { owner: { phone: { contains: q.replace(/[\s-]/g, "").replace(/^\+94/, "0") } } },
        ],
      }
    : undefined;

  const [rows, byStatus] = await Promise.all([
    db.groupCart.findMany({
      where: { status: filter, ...search },
      include: { owner: { select: { name: true } }, _count: { select: { members: true } } },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE + 1,
    }),
    db.groupCart.groupBy({ by: ["status"], where: search, _count: true }),
  ]);
  const carts = rows.slice(0, PAGE);
  const count = (s: CartStatus) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const total = byStatus.reduce((n, b) => n + b._count, 0);
  const href = (values: Record<string, string | number | undefined>) =>
    hrefWith("/admin/carts", { status: filter, q, ...values });
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Carts"
        actions={
          <a
            href="/admin/export/orders?days=30"
            className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm hover:bg-muted sm:min-h-10"
          >
            Export orders (CSV)
          </a>
        }
      />
      <SearchForm
        action="/admin/carts"
        q={q}
        placeholder="Code, cart name, owner name, email or mobile"
        keep={{ status: filter }}
      />
      {/* Phones: one dropdown with counts. From sm up: the chips. */}
      <FilterSelect
        action="/admin/carts"
        name="status"
        label="Filter by status"
        value={filter}
        keep={{ q }}
        options={[
          { value: "", label: `All statuses (${total})` },
          ...STATUSES.map((s) => ({ value: s, label: `${STATUS_LABEL[s]} (${count(s)})` })),
        ]}
      />
      <ChipRow className="hidden sm:flex">
        <Chip href={href({ status: undefined })} active={!filter}>
          All
        </Chip>
        {STATUSES.map((s) => (
          <Chip key={s} href={href({ status: s })} active={filter === s}>
            {STATUS_LABEL[s]} <Count n={count(s)} />
          </Chip>
        ))}
      </ChipRow>
      {carts.length === 0 ? (
        <EmptyState title={q ? `No carts match "${q}"` : "No carts"} />
      ) : (
        <Table
          head={
            <>
              <th>Code</th>
              <th>Owner</th>
              <th>Members</th>
              <th className="text-right">Total</th>
              <th>Status</th>
              <th>Due</th>
              <th>Updated</th>
            </>
          }
        >
          {carts.map((c) => (
            <tr key={c.id}>
              <td>
                <Link href={`/admin/carts/${c.code}`} className="font-mono text-accent underline">
                  {c.code}
                </Link>
                {c.visibility === "PRIVATE" && (
                  <span className="ml-2">
                    <Badge>Private</Badge>
                  </span>
                )}
              </td>
              <td>
                <Link href={`/admin/users/${c.ownerId}`} className="hover:underline">
                  {c.owner.name}
                </Link>
              </td>
              <td>{c._count.members}</td>
              <td className="text-right">{formatLKR(c.total)}</td>
              <td>
                <StatusBadge status={c.status} />
              </td>
              <td className="text-warn">
                {c.status === "AWAITING_SLIP" && c.slipDueAt
                  ? `Slip: ${timeLeft(c.slipDueAt, now)}`
                  : isEditable(c.status)
                    ? timeLeft(c.expiresAt, now)
                    : ""}
              </td>
              <td className="text-subtle">{formatDateTime(c.updatedAt)}</td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={page} hasNext={rows.length > PAGE} href={(p) => href({ page: p })} />
    </>
  );
}
