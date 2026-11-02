import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/cart-bits";
import { Badge, EmptyState, PageHeader, cx } from "@/components/ui";
import type { Prisma, Role } from "@/generated/prisma/client";
import { ADMIN_AREA_LABEL, type OperationalAdminArea } from "@/lib/admin-access";
import { type CartStatus, HOLDS_STOCK } from "@/lib/cart-rules";
import { formatDate, formatDateTime } from "@/lib/format";
import { areaUsersWhere } from "@/server/admin-users";
import { requireAnyAdmin } from "@/server/auth/session";
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

export const metadata: Metadata = { title: "Users" };

const PAGE = 50;
const FILTERS = {
  customers: { role: "CUSTOMER" },
  sellers: { role: "SELLER", isBrand: false },
  brands: { role: "SELLER", isBrand: true },
  packers: { role: "PACKER" },
  admins: { role: "ADMIN" },
  locked: { locked: true },
} satisfies Record<string, Prisma.UserWhereInput>;
type Filter = keyof typeof FILTERS;
/** The role chips each area sees; the list itself is limited by `areaUsersWhere`. */
const AREA_FILTERS: Record<OperationalAdminArea, Filter[]> = {
  PREMIUM: ["brands", "admins", "locked"],
  FACTORY: ["sellers", "admins", "locked"],
  WAREHOUSE: ["customers", "packers", "admins", "locked"],
};
const BUTTON =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-4 text-sm font-medium hover:bg-muted sm:min-h-10";
const FILTER_LABEL: Record<Filter, string> = {
  customers: "Buyers",
  sellers: "Factory sellers",
  brands: "Premium brands",
  packers: "Packing staff",
  admins: "Admins",
  locked: "Locked",
};

/**
 * The accounts this admin's area manages. Phones get one card per user (tap anywhere to open, tap
 * the mobile to call); from `md` up a table, with the city column from `lg`. Role chips carry
 * counts that follow the search.
 */
export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const admin = await requireAnyAdmin();
  const area = admin.adminArea;
  const filters = AREA_FILTERS[area];
  await sweep();
  const sp = await searchParams;
  const show = filters.find((f) => f === param(sp, "show"));
  const q = param(sp, "q");
  const page = pageNumber(sp);

  const search: Prisma.UserWhereInput = {
    AND: [
      areaUsersWhere(area),
      q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q.replace(/[\s-]/g, "").replace(/^\+94/, "0") } },
              { city: { contains: q, mode: "insensitive" } },
              { company: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };

  const [rows, byRole, lockedCount, brandCount] = await Promise.all([
    db.user.findMany({
      where: { ...(show ? FILTERS[show] : {}), ...search },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        city: true,
        company: true,
        role: true,
        adminArea: true,
        locked: true,
        createdAt: true,
        _count: {
          select: {
            ownedCarts: true,
            memberships: true,
            products: true,
            gathered: true,
            packed: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE + 1,
    }),
    db.user.groupBy({ by: ["role"], where: search, _count: true }),
    db.user.count({ where: { ...search, locked: true } }),
    db.user.count({ where: { ...search, role: "SELLER", isBrand: true } }),
  ]);
  const users = rows.slice(0, PAGE);

  // The cart each buyer is in right now (one cart at a time, so at most one).
  const live = await db.cartMember.findMany({
    where: {
      userId: { in: users.map((u) => u.id) },
      cart: { status: { in: [...HOLDS_STOCK] } },
    },
    select: { userId: true, cart: { select: { code: true, status: true } } },
  });
  const liveCart = new Map(live.map((m) => [m.userId, m.cart]));

  const roleCount = (role: Role) => byRole.find((r) => r.role === role)?._count ?? 0;
  const counts: Record<Filter | "all", number> = {
    all: byRole.reduce((n, r) => n + r._count, 0),
    customers: roleCount("CUSTOMER"),
    sellers: roleCount("SELLER") - brandCount,
    brands: brandCount,
    packers: roleCount("PACKER"),
    admins: roleCount("ADMIN"),
    locked: lockedCount,
  };
  const shown = counts[show ?? "all"];
  const href = (values: Record<string, string | number | undefined>) =>
    hrefWith("/admin/users", { show, q, ...values });

  return (
    <>
      <PageHeader
        title="Users"
        actions={
          <>
            <Link href="/admin/users/new-admin" className={BUTTON}>
              Add admin
            </Link>
            {area === "WAREHOUSE" && (
              <Link href="/admin/users/new-packer" className={BUTTON}>
                <span aria-hidden>+</span> Add packing staff
              </Link>
            )}
            {area !== "WAREHOUSE" && (
              <Link
                href="/admin/users/new-seller"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent hover:opacity-90 sm:min-h-10"
              >
                <span aria-hidden>+</span>{" "}
                {area === "PREMIUM" ? "Add premium brand" : "Add factory seller"}
              </Link>
            )}
          </>
        }
      />

      {/* One block, so the layout's gap doesn't open up between search, filters and count. */}
      <div>
        <SearchForm
          action="/admin/users"
          q={q}
          placeholder="Name, email, mobile, city"
          label="Search by name, company, email, mobile or city"
          keep={{ show }}
        />
        {/* Phones: one dropdown with counts. From sm up: the chips. */}
        <FilterSelect
          action="/admin/users"
          name="show"
          label="Filter by role"
          value={show}
          keep={{ q }}
          options={[
            { value: "", label: `All users (${counts.all})` },
            ...filters.map((f) => ({
              value: f,
              label: `${FILTER_LABEL[f]} (${counts[f]})`,
            })),
          ]}
        />
        <ChipRow className="hidden sm:flex">
          <Chip href={href({ show: undefined, page: undefined })} active={!show}>
            All <Count n={counts.all} />
          </Chip>
          {filters.map((f) => (
            <Chip key={f} href={href({ show: f, page: undefined })} active={show === f}>
              {FILTER_LABEL[f]} <Count n={counts[f]} tone={f === "locked" ? "alert" : "muted"} />
            </Chip>
          ))}
        </ChipRow>

        <p className="text-sm text-subtle">
          {shown} {shown === 1 ? "user" : "users"}
          {q && ` matching "${q}"`}
          {show && ` · ${FILTER_LABEL[show].toLowerCase()}`}
        </p>
      </div>

      {users.length === 0 ? (
        <EmptyState title={q ? `No users match "${q}"` : "No users here"}>
          {(q || show) && (
            <Link href="/admin/users" className="text-accent underline">
              Show everyone
            </Link>
          )}
        </EmptyState>
      ) : (
        <>
          {/* Phones and small tablets: one card per user, two columns from sm. */}
          <ul className="grid gap-2 sm:grid-cols-2 md:hidden">
            {users.map((u) => {
              const cart = liveCart.get(u.id);
              return (
                <li
                  key={u.id}
                  className="relative flex gap-3 rounded-xl border border-line p-3 hover:bg-muted/50"
                >
                  <Avatar name={u.name} role={u.role} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="min-w-0 truncate font-semibold after:absolute after:inset-0 after:rounded-xl"
                      >
                        {u.name}
                      </Link>
                      <span aria-hidden className="text-subtle">
                        ›
                      </span>
                    </div>
                    <p className="truncate text-xs text-subtle">{u.email}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <RoleBadge role={u.role} company={u.company} adminArea={u.adminArea} />
                      {u.locked && <Badge tone="bad">Locked</Badge>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      {u.phone && (
                        <a
                          href={`tel:${u.phone}`}
                          className="relative z-10 inline-flex min-h-9 items-center text-accent underline"
                        >
                          {u.phone}
                        </a>
                      )}
                      {u.city && <span className="text-subtle">{u.city}</span>}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2 text-xs text-subtle">
                      <Activity user={u} cart={cart} />
                      <span className="ml-auto shrink-0" title={formatDateTime(u.createdAt)}>
                        Since {formatDate(u.createdAt)}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Tablets and desktop: a table; the city column joins from lg. */}
          <div className="hidden md:block">
            <Table
              head={
                <>
                  <th>User</th>
                  <th>Role</th>
                  <th>Mobile</th>
                  <th className="hidden lg:table-cell">City</th>
                  <th>Activity</th>
                  <th className="text-right">Signed up</th>
                </>
              }
            >
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-muted/50">
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} role={u.role} />
                      <div className="min-w-0">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="block max-w-56 truncate font-medium text-accent underline lg:max-w-72"
                        >
                          {u.name}
                        </Link>
                        <span className="block max-w-56 truncate text-xs text-subtle lg:max-w-72">
                          {u.email}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-col items-start gap-1">
                      <RoleBadge role={u.role} company={u.company} adminArea={u.adminArea} />
                      {u.locked && <Badge tone="bad">Locked</Badge>}
                    </div>
                  </td>
                  <td className="tabular-nums">
                    {u.phone ? (
                      <a href={`tel:${u.phone}`} className="hover:underline">
                        {u.phone}
                      </a>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                  <td className="hidden lg:table-cell">
                    {u.city ?? <span className="text-subtle">—</span>}
                  </td>
                  <td>
                    <Activity user={u} cart={liveCart.get(u.id)} />
                  </td>
                  <td className="text-right text-subtle" title={formatDateTime(u.createdAt)}>
                    {formatDate(u.createdAt)}
                  </td>
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

/** Initials in a circle, tinted by role. */
function Avatar({ name, role }: { name: string; role: Role }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={cx(
        "grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold",
        role === "CUSTOMER" && "bg-muted text-ink",
        role === "SELLER" && "bg-accent/15 text-accent",
        role === "PACKER" && "border border-accent text-accent",
        role === "ADMIN" && "bg-ink text-paper",
      )}
    >
      {initials || "?"}
    </span>
  );
}

function RoleBadge({
  role,
  company,
  adminArea,
}: {
  role: Role;
  company: string | null;
  adminArea: string | null;
}) {
  if (role === "ADMIN")
    return <Badge tone="info">{ADMIN_AREA_LABEL[adminArea ?? ""] ?? "Admin"}</Badge>;
  if (role === "SELLER")
    return (
      <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
        <Badge tone="info">Seller</Badge>
        {company && <span className="truncate text-xs text-subtle">{company}</span>}
      </span>
    );
  if (role === "PACKER") return <Badge tone="info">Packing</Badge>;
  return <Badge>Buyer</Badge>;
}

/** What the user does here: a buyer's carts (and the one they are in now), a seller's products. */
function Activity({
  user,
  cart,
}: {
  user: {
    role: Role;
    _count: {
      ownedCarts: number;
      memberships: number;
      products: number;
      gathered: number;
      packed: number;
    };
  };
  cart?: { code: string; status: CartStatus };
}) {
  if (user.role === "SELLER") {
    const n = user._count.products;
    return (
      <span className="text-subtle">
        {n} {n === 1 ? "product" : "products"}
      </span>
    );
  }
  if (user.role === "ADMIN") return <span className="text-subtle">Back office</span>;
  if (user.role === "PACKER") {
    // Each order they gathered or packed is one they certified.
    const n = user._count.gathered + user._count.packed;
    return (
      <span className="text-subtle">
        {n} {n === 1 ? "order" : "orders"} checked
      </span>
    );
  }
  const { ownedCarts, memberships } = user._count;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {cart && (
        <Link
          href={`/admin/carts/${cart.code}`}
          className="relative z-10 inline-flex items-center gap-1.5"
          aria-label={`In cart ${cart.code}`}
        >
          <span className="font-mono text-xs text-accent underline">{cart.code}</span>
          <StatusBadge status={cart.status} />
        </Link>
      )}
      <span className="text-subtle">
        {ownedCarts + memberships === 0
          ? "No carts yet"
          : `${ownedCarts} started · ${memberships} joined`}
      </span>
    </span>
  );
}
