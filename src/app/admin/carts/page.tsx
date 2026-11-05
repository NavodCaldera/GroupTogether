import { visibleTotals, cancelledValue } from "@/server/carts/visible-totals";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/cart-bits";
import { Badge, Button, EmptyState, Input, PageHeader, cx } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import {
  ADMIN_STAGES,
  type CartStatus,
  HOLDS_STOCK,
  STATUS_LABEL,
  byUrgency,
} from "@/lib/cart-rules";
import { D } from "@/lib/decimal";
import { colomboDateRange, formatDateTime, formatLKR } from "@/lib/format";
import { cartSearch } from "@/server/admin-queries";
import { requireAdmin } from "@/server/auth/session";
import { sweep } from "@/server/carts/service";
import { db } from "@/server/db";
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
  await requireAdmin("WAREHOUSE");
  await sweep();
  const sp = await searchParams;
  const exact = STATUSES.find((s) => s === param(sp, "status"));
  const q = param(sp, "q");
  // Started between these days (Colombo, both included; product owner 2026-10-20).
  const dates = colomboDateRange(param(sp, "from"), param(sp, "to"));
  const { from, to } = dates;
  // A search or date filter with no stage picked looks through every cart, finished ones too.
  const filtering = Boolean(q || dates.range);
  const picked = param(sp, "stage");
  const stage =
    ADMIN_STAGES.find((s) => s.key === (picked ?? (filtering ? "all" : undefined))) ??
    ADMIN_STAGES[0];
  const statuses = exact ? [exact] : stage.statuses;
  const canUrgency = statuses.every((s) => LIVE.includes(s));
  const urgency = canUrgency && param(sp, "sort") !== "latest";
  const page = pageNumber(sp);
  const now = new Date();

  const search: Prisma.GroupCartWhereInput = {
    ...(q ? cartSearch(q) : {}),
    createdAt: dates.range,
  };
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
    _count: { select: { members: true } },
  } satisfies Prisma.GroupCartSelect;

  const [rows, byStatus] = await Promise.all([
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
  ]);
  const carts = await visibleTotals(rows.slice(0, PAGE));
  const count = (list: readonly CartStatus[]) =>
    byStatus.filter((b) => list.includes(b.status)).reduce((n, b) => n + b._count, 0);
  const inView = byStatus.filter((b) => statuses.includes(b.status));
  const viewTotal = inView
    .reduce((sum, b) => sum.plus(b._sum.total?.toString() ?? 0), new D(0))
    .minus(await cancelledValue({ ...search, status: { in: [...statuses] } }));
  const holding = count(statuses.filter((s) => HOLDS_STOCK.includes(s)));
  const href = (values: Record<string, string | number | undefined>) =>
    hrefWith("/admin/carts", {
      stage: exact || (stage.key === "active" && !filtering) ? undefined : stage.key,
      status: exact,
      q,
      from,
      to,
      sort: urgency ? undefined : canUrgency ? "latest" : undefined,
      ...values,
    });

  return (
    <>
      <PageHeader title="Carts" />

      <SearchForm
        action="/admin/carts"
        q={q}
        placeholder="Code, cart name, owner name, email or mobile"
        suggest="/api/admin/carts/suggest"
        keep={{ stage: exact ? undefined : picked, status: exact, from, to }}
      />
      <form action="/admin/carts" className="mb-4 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        {Object.entries({ q, stage: exact ? undefined : picked, status: exact }).map(
          ([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />,
        )}
        <label className="flex min-w-0 flex-col gap-1 text-xs text-subtle">
          From
          <Input type="date" name="from" defaultValue={from} className="w-full min-w-0" />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-subtle">
          To
          <Input type="date" name="to" defaultValue={to} className="w-full min-w-0" />
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {(from || to) && (
          <Link
            href={href({ from: undefined, to: undefined, page: undefined, stage: picked })}
            className="col-span-3 justify-self-start text-xs text-subtle underline"
          >
            Clear dates ✕
          </Link>
        )}
      </form>
      {/* Phones: one dropdown with counts. From sm up: the chips. */}
      <FilterSelect
        action="/admin/carts"
        name="stage"
        label="Filter by stage"
        value={exact ? undefined : stage.key}
        keep={{ q, from, to }}
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
              stage: s.key === "active" && !filtering ? undefined : s.key,
              q,
              from,
              to,
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
        <EmptyState
          title={q ? `No carts match "${q}"` : filtering ? "No carts match" : "No carts here"}
        />
      ) : (
        <>
          {/* Phones: one card per cart. */}
          <ul className="flex flex-col gap-2 md:hidden">
            {carts.map((c) => {
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
                  <NextStep cart={c} now={now} className="mt-2" />
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
                    <NextStep cart={c} now={now} />
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
