import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/cart-bits";
import { packingSummary } from "@/components/packing-bits";
import { Badge, EmptyState, PageHeader, cx } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import {
  ADMIN_STAGES,
  ADMIN_TURN,
  type CartStatus,
  HOLDS_STOCK,
  STATUS_LABEL,
  byUrgency,
} from "@/lib/cart-rules";
import { D } from "@/lib/decimal";
import { formatDateTime, formatLKR } from "@/lib/format";
import { requireAdmin } from "@/server/auth/session";
import { sweep } from "@/server/carts/service";
import { db } from "@/server/db";
import { packingSelect } from "@/server/packing";
import { FilterSelect } from "../filter-select";
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
import { MiniProgress, NextStep } from "./next-step";

export const metadata: Metadata = { title: "Carts" };

const STATUSES = Object.keys(STATUS_LABEL) as CartStatus[];
const LIVE = ADMIN_STAGES[0].statuses;
const PAGE = 50;
/** Live carts are sorted in memory (by whose turn and deadline); there are never this many. */
const LIVE_CAP = 1000;

/**
 * All carts for the admin. "Needs you" tiles on top, then stage tabs (Active by default). Live
 * stages sort by urgency (the admin's turn first, then the soonest deadline); `?sort=latest` and
 * the finished stages sort by latest activity. `?status=` still filters one exact status.
 */
export default async function AdminCartsPage({ searchParams }: PageProps<"/admin/carts">) {
  await requireAdmin();
  await sweep();
  const sp = await searchParams;
  const exact = STATUSES.find((s) => s === param(sp, "status"));
  const q = param(sp, "q");
  // A search with no stage picked looks through every cart, so finished ones are found too.
  const picked = param(sp, "stage");
  const stage =
    ADMIN_STAGES.find((s) => s.key === (picked ?? (q ? "all" : undefined))) ?? ADMIN_STAGES[0];
  const statuses = exact ? [exact] : stage.statuses;
  const canUrgency = statuses.every((s) => LIVE.includes(s));
  const urgency = canUrgency && param(sp, "sort") !== "latest";
  const page = pageNumber(sp);
  const now = new Date();

  const search: Prisma.GroupCartWhereInput | undefined = q
    ? {
        OR: [
          { code: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { owner: { name: { contains: q, mode: "insensitive" } } },
          { owner: { email: { contains: q, mode: "insensitive" } } },
          { owner: { phone: { contains: q.replace(/[\s-]/g, "").replace(/^\+94/, "0") } } },
        ],
      }
    : undefined;
  const where: Prisma.GroupCartWhereInput = { status: { in: [...statuses] }, ...search };
  const select = {
    id: true,
    code: true,
    status: true,
    visibility: true,
    total: true,
    minOrderValue: true,
    expiresAt: true,
    slipDueAt: true,
    updatedAt: true,
    closedReason: true,
    ownerId: true,
    owner: { select: { name: true } },
    delivery: { select: { status: true } },
    packing: { select: packingSelect },
    slips: { where: { status: "PENDING" }, select: { id: true }, take: 1 },
    _count: { select: { members: true } },
  } satisfies Prisma.GroupCartSelect;

  const [rows, byStatus, turn] = await Promise.all([
    urgency
      ? db.groupCart
          .findMany({ where, select, take: LIVE_CAP })
          .then((all) => all.sort(byUrgency).slice((page - 1) * PAGE, page * PAGE + 1))
      : db.groupCart.findMany({
          where,
          select,
          orderBy: { updatedAt: "desc" },
          skip: (page - 1) * PAGE,
          take: PAGE + 1,
        }),
    db.groupCart.groupBy({ by: ["status"], where: search, _count: true, _sum: { total: true } }),
    db.groupCart.groupBy({
      by: ["status"],
      where: { status: { in: [...ADMIN_TURN] } },
      _count: true,
    }),
  ]);
  const carts = rows.slice(0, PAGE);
  const count = (list: readonly CartStatus[]) =>
    byStatus.filter((b) => list.includes(b.status)).reduce((n, b) => n + b._count, 0);
  const inView = byStatus.filter((b) => statuses.includes(b.status));
  const viewTotal = inView.reduce((sum, b) => sum.plus(b._sum.total?.toString() ?? 0), new D(0));
  const holding = count(statuses.filter((s) => HOLDS_STOCK.includes(s)));
  const turnCount = (s: CartStatus) => turn.find((t) => t.status === s)?._count ?? 0;
  const href = (values: Record<string, string | number | undefined>) =>
    hrefWith("/admin/carts", {
      stage: exact || (stage.key === "active" && !q) ? undefined : stage.key,
      status: exact,
      q,
      sort: urgency ? undefined : canUrgency ? "latest" : undefined,
      ...values,
    });

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

      <section aria-label="Needs you" className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        <NeedsTile n={turnCount("SLIP_REVIEW")} label="Slips to review" href="/admin/slips" />
        <NeedsTile
          n={turnCount("CONFIRMED")}
          label="To book"
          href="/admin/carts?status=CONFIRMED"
        />
        <NeedsTile
          n={turnCount("DISPATCHED")}
          label="Out for delivery"
          href="/admin/carts?status=DISPATCHED"
        />
      </section>

      <SearchForm
        action="/admin/carts"
        q={q}
        placeholder="Code, cart name, owner name, email or mobile"
        keep={{ stage: exact ? undefined : picked, status: exact }}
      />
      {/* Phones: one dropdown with counts. From sm up: the chips. */}
      <FilterSelect
        action="/admin/carts"
        name="stage"
        label="Filter by stage"
        value={exact ? undefined : stage.key}
        keep={{ q }}
        options={[
          ...(exact ? [{ value: "", label: `${STATUS_LABEL[exact]} (${count([exact])})` }] : []),
          ...ADMIN_STAGES.map((s) => ({
            value: s.key,
            label: `${s.label} (${count(s.statuses)})`,
          })),
        ]}
      />
      <ChipRow className="hidden sm:flex">
        {ADMIN_STAGES.map((s) => (
          <Chip
            key={s.key}
            href={hrefWith("/admin/carts", {
              stage: s.key === "active" && !q ? undefined : s.key,
              q,
            })}
            active={!exact && stage.key === s.key}
          >
            {s.label} <Count n={count(s.statuses)} />
          </Chip>
        ))}
        {exact && (
          <Chip href={href({ status: undefined })} active>
            {STATUS_LABEL[exact]} <span aria-label="Remove this filter">✕</span>
          </Chip>
        )}
      </ChipRow>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-subtle">
          {count(statuses)} {count(statuses) === 1 ? "cart" : "carts"} · {formatLKR(viewTotal)}
          {holding > 0 && ` · ${holding} holding stock`}
        </p>
        {canUrgency && (
          <div className="flex gap-1 text-xs" role="group" aria-label="Sort">
            <SortLink href={href({ sort: undefined, page: undefined })} active={urgency}>
              Due first
            </SortLink>
            <SortLink href={href({ sort: "latest", page: undefined })} active={!urgency}>
              Latest
            </SortLink>
          </div>
        )}
      </div>

      {carts.length === 0 ? (
        <EmptyState title={q ? `No carts match "${q}"` : "No carts here"} />
      ) : (
        <>
          {/* Phones: one card per cart. */}
          <ul className="flex flex-col gap-2 md:hidden">
            {carts.map((c) => {
              const step = { ...c, pendingSlipId: c.slips[0]?.id };
              return (
                <li key={c.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/admin/carts/${c.code}`}
                      className="font-mono font-semibold text-accent underline"
                    >
                      {c.code}
                    </Link>
                    <span className="flex items-center gap-1.5">
                      {c.visibility === "PRIVATE" && <Badge>Private</Badge>}
                      <StatusBadge status={c.status} />
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-subtle">
                    {c.owner.name} · {c._count.members}{" "}
                    {c._count.members === 1 ? "member" : "members"}
                  </p>
                  <p className="mt-2 font-semibold tabular-nums">{formatLKR(c.total)}</p>
                  {c.status === "OPEN" && <MiniProgress total={c.total} min={c.minOrderValue} />}
                  <NextStep cart={step} now={now} className="mt-2" />
                  {c.packing && (
                    <p className="mt-1 text-xs text-subtle">{packingSummary(c.packing)}</p>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="hidden md:block">
            <Table
              head={
                <>
                  <th>Cart</th>
                  <th>Members</th>
                  <th className="text-right">Total</th>
                  <th>Status</th>
                  <th>Next</th>
                  <th>Updated</th>
                </>
              }
            >
              {carts.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link
                      href={`/admin/carts/${c.code}`}
                      className="font-mono text-accent underline"
                    >
                      {c.code}
                    </Link>
                    {c.visibility === "PRIVATE" && (
                      <span className="ml-2">
                        <Badge>Private</Badge>
                      </span>
                    )}
                    <Link
                      href={`/admin/users/${c.ownerId}`}
                      className="block text-xs text-subtle hover:underline"
                    >
                      {c.owner.name}
                    </Link>
                  </td>
                  <td>{c._count.members}</td>
                  <td className="text-right tabular-nums">
                    {formatLKR(c.total)}
                    {c.status === "OPEN" && (
                      <div className="flex justify-end">
                        <MiniProgress total={c.total} min={c.minOrderValue} />
                      </div>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="max-w-72 whitespace-normal">
                    <NextStep cart={{ ...c, pendingSlipId: c.slips[0]?.id }} now={now} />
                    {c.packing && (
                      <p className="mt-1 text-xs text-subtle">{packingSummary(c.packing)}</p>
                    )}
                  </td>
                  <td className="text-subtle">{formatDateTime(c.updatedAt)}</td>
                </tr>
              ))}
            </Table>
          </div>
        </>
      )}
      <Pager page={page} hasNext={rows.length > PAGE} href={(p) => href({ page: p })} />
    </>
  );
}

/** One "Needs you" count; greyed out when there is nothing to do. */
function NeedsTile({ n, label, href }: { n: number; label: string; href: string }) {
  return (
    <Link
      href={href}
      className={cx(
        "flex flex-col justify-between gap-1 rounded-xl border p-3 hover:bg-muted sm:flex-row sm:items-center",
        n > 0 ? "border-accent" : "border-line text-subtle",
      )}
    >
      <span className="text-xs leading-tight sm:text-sm">{label}</span>
      <span
        className={cx("text-2xl font-semibold tabular-nums sm:text-xl", n > 0 && "text-accent")}
      >
        {n}
      </span>
    </Link>
  );
}

function SortLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cx(
        "inline-flex min-h-9 items-center rounded-md px-2.5 sm:min-h-7",
        active ? "bg-muted font-medium text-ink" : "text-subtle hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
