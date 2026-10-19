import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CopyLinkButton, Countdown } from "@/components/client";
import { Toast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, cx } from "@/components/ui";
import { formatDateTime, formatLKR, waitedFor } from "@/lib/format";
import { requireAdmin } from "@/server/auth/session";
import { sweep } from "@/server/carts/service";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { FilterSelect } from "../filter-select";
import { Chip, ChipRow, Count, Table, hrefWith, param } from "../list-bits";
import { SlipDecision } from "./slip-decision";

export const metadata: Metadata = { title: "Bank slips" };

/**
 * The slip review queue. Desktop: the queue on the left, the open slip on the right (the oldest
 * when none is picked). Phones: the queue, then one slip full screen with the decision docked at
 * the bottom. `?slip=<id>` opens a slip; `?done=approved|rejected&cart=<code>` follows a decision.
 */
export default async function SlipsPage({ searchParams }: PageProps<"/admin/slips">) {
  await requireAdmin();
  const sp = await searchParams;
  if (param(sp, "view") === "history") return <SlipHistory sp={sp} />;

  await sweep();
  const now = new Date();
  const queue = await db.paymentSlip.findMany({
    where: { status: "PENDING" },
    select: {
      id: true,
      amount: true,
      createdAt: true,
      cart: { select: { code: true } },
      uploader: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const wanted = param(sp, "slip");
  const done = param(sp, "done");
  const doneCart = param(sp, "cart") ?? "";
  // On phones the list shows until a slip is picked; on desktop the oldest opens by itself.
  const focused = Boolean(wanted || done);
  const openId = wanted ?? (done ? undefined : queue[0]?.id);
  const isOpen = openId && queue.some((s) => s.id === openId);

  const notice =
    done === "approved" ? (
      <Toast ms={5000}>Slip approved. Cart {doneCart} is confirmed.</Toast>
    ) : done === "rejected" ? (
      <Toast ms={5000}>Slip rejected. The owner has been asked for a new one.</Toast>
    ) : null;

  let panel: ReactNode;
  if (isOpen) {
    const position = queue.findIndex((s) => s.id === openId) + 1;
    panel = <SlipReview id={openId} position={position} of={queue.length} now={now} />;
  } else if (done) {
    panel = <DonePanel done={done} code={doneCart} nextId={queue[0]?.id} />;
  } else if (wanted) {
    panel = (
      <Card className="flex flex-col items-start gap-3">
        <p className="font-medium">This slip has already been reviewed.</p>
        <NextSlipLink id={queue[0]?.id} />
      </Card>
    );
  }

  return (
    <>
      <PageHeader title="Bank slips" />
      <Tabs history={false} pending={queue.length} />
      {notice}
      {queue.length === 0 ? (
        <div className="flex flex-col gap-4">
          {panel}
          <EmptyState title="No slips waiting">
            New slips show up here as owners upload them.
          </EmptyState>
          <ExpectedSoon />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
          <nav aria-label="Slips to review" className={cx(focused && "hidden lg:block")}>
            <ul className="flex flex-col gap-2">
              {queue.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/admin/slips?slip=${s.id}`}
                    aria-current={s.id === openId ? "page" : undefined}
                    className={cx(
                      "flex items-center justify-between gap-3 rounded-xl border p-3 hover:bg-muted",
                      s.id === openId ? "lg:border-accent lg:bg-accent/10" : "border-line",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold tabular-nums">
                        {formatLKR(s.amount)}
                      </span>
                      <span className="block truncate text-xs text-subtle">
                        <span className="font-mono">{s.cart.code}</span> · {s.uploader.name}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-subtle">
                      {waitedFor(s.createdAt, now)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {panel && <div className={cx("min-w-0", !focused && "hidden lg:block")}>{panel}</div>}
        </div>
      )}
    </>
  );
}

function Tabs({ history, pending }: { history: boolean; pending: number }) {
  return (
    <>
      {/* Phones: one dropdown instead of the chips. */}
      <FilterSelect
        action="/admin/slips"
        name="view"
        label="Show slips"
        value={history ? "history" : ""}
        options={[
          { value: "", label: pending > 0 ? `To review (${pending})` : "To review" },
          { value: "history", label: "Reviewed" },
        ]}
      />
      <ChipRow className="hidden sm:flex">
        <Chip href="/admin/slips" active={!history}>
          To review <Count n={pending} />
        </Chip>
        <Chip href="/admin/slips?view=history" active={history}>
          Reviewed
        </Chip>
      </ChipRow>
    </>
  );
}

/** "← All slips": only on phones, where the queue and the slip are separate screens. */
function AllSlipsLink() {
  return (
    <Link
      href="/admin/slips"
      className="mb-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-subtle hover:text-ink lg:hidden"
    >
      <span aria-hidden>←</span> All slips
    </Link>
  );
}

function NextSlipLink({ id, primary = false }: { id?: string; primary?: boolean }) {
  if (!id) return <p className="text-sm text-subtle">No more slips waiting.</p>;
  return (
    <Link
      href={`/admin/slips?slip=${id}`}
      className={cx(
        "inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium sm:min-h-10",
        primary ? "bg-accent text-on-accent hover:opacity-90" : "border border-line hover:bg-muted",
      )}
    >
      Next slip →
    </Link>
  );
}

/** After a decision: what happened and where to go next. */
function DonePanel({ done, code, nextId }: { done: string; code: string; nextId?: string }) {
  const approved = done === "approved";
  return (
    <Card className="flex flex-col gap-3">
      <AllSlipsLink />
      <div>
        <p className="text-lg font-semibold">
          {approved ? "Order confirmed" : "Sent back to the owner"}
        </p>
        <p className="mt-1 text-sm text-subtle">
          {approved ? (
            <>
              Cart <span className="font-mono">{code}</span> is paid and its members have been told.
              Next, book its PickMe drop.
            </>
          ) : (
            <>
              The owner of cart <span className="font-mono">{code}</span> sees your reason and can
              upload a new slip.
            </>
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {approved && (
          <Link
            href={`/admin/carts/${code}`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-on-accent hover:opacity-90 sm:min-h-10"
          >
            Book the PickMe delivery
          </Link>
        )}
        <NextSlipLink id={nextId} primary={!approved} />
        {!approved && (
          <Link
            href={`/admin/carts/${code}`}
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-accent underline sm:min-h-10"
          >
            Open the cart
          </Link>
        )}
      </div>
    </Card>
  );
}

/** One pending slip: the slip itself, what to check it against, who sent it, and the decision. */
async function SlipReview({
  id,
  position,
  of,
  now,
}: {
  id: string;
  position: number;
  of: number;
  now: Date;
}) {
  const [slip, settings] = await Promise.all([
    db.paymentSlip.findUniqueOrThrow({
      where: { id },
      include: {
        uploader: { select: { name: true, phone: true, email: true } },
        cart: {
          select: {
            code: true,
            _count: { select: { members: true } },
            slips: {
              where: { status: "REJECTED" },
              select: { id: true, createdAt: true, reviewNote: true },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    }),
    getSettings(),
  ]);
  const code = slip.cart.code;
  const url = `/api/slips/${slip.id}`;
  const isPdf = slip.contentType === "application/pdf";
  const tries = slip.cart.slips.length;
  const members = slip.cart._count.members;

  return (
    <>
      <AllSlipsLink />
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-2xl font-semibold tabular-nums">{formatLKR(slip.amount)}</p>
        <p className="text-xs text-subtle">
          Slip {position} of {of} · waiting {waitedFor(slip.createdAt, now)}
        </p>
      </div>

      {tries > 0 && (
        <div className="mb-4 rounded-lg border border-line bg-muted px-3 py-2 text-sm">
          <p className="font-medium">
            Try {tries + 1}. {tries === 1 ? "The first slip was" : `${tries} earlier slips were`}{" "}
            rejected:
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-subtle">
            {slip.cart.slips.map((r) => (
              <li key={r.id}>
                {formatDateTime(r.createdAt)}: “{r.reviewNote}” ·{" "}
                <a
                  href={`/api/slips/${r.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline"
                >
                  Open
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
        {isPdf ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-muted p-6 text-center hover:border-accent"
          >
            <span className="text-4xl" aria-hidden>
              📄
            </span>
            <span className="font-medium text-accent underline">Open the PDF slip</span>
            <span className="text-xs text-subtle">Opens in a new tab</span>
          </a>
        ) : (
          <a href={url} target="_blank" rel="noopener noreferrer" className="group block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Bank slip for cart ${code}`}
              decoding="async"
              className="max-h-[70vh] w-full rounded-xl border border-line bg-muted object-contain"
            />
            <span className="mt-1 block text-center text-xs text-subtle group-hover:text-ink">
              Tap to open full size
            </span>
          </a>
        )}

        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Check these on the bank account</h2>
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="text-xs text-subtle">Amount</dt>
                <dd className="text-lg font-semibold tabular-nums">{formatLKR(slip.amount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Reference (cart code)</dt>
                <dd className="flex items-center justify-between gap-2">
                  <span className="font-mono text-lg font-semibold">{code}</span>
                  <CopyLinkButton url={code} label="Copy" copiedLabel="Copied" />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Paid into</dt>
                <dd>
                  {settings.accountNumber ? (
                    <>
                      <span className="block">{settings.accountName}</span>
                      <span className="block font-mono">{settings.accountNumber}</span>
                      <span className="block text-subtle">
                        {[settings.bankName, settings.bankBranch].filter(Boolean).join(", ")}
                      </span>
                    </>
                  ) : (
                    <Link href="/admin/settings" className="text-accent underline">
                      Bank details aren&apos;t set up
                    </Link>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Uploaded</dt>
                <dd>{formatDateTime(slip.createdAt)}</dd>
              </div>
            </dl>
          </Card>

          <Card className="text-sm">
            <h2 className="mb-2 font-semibold">Owner</h2>
            <p>{slip.uploader.name}</p>
            {slip.uploader.phone && (
              <a href={`tel:${slip.uploader.phone}`} className="block text-accent underline">
                {slip.uploader.phone}
              </a>
            )}
            <p className="break-all text-subtle">{slip.uploader.email}</p>
            <Link href={`/admin/carts/${code}`} className="mt-2 inline-block text-accent underline">
              Cart <span className="font-mono">{code}</span> · {members}{" "}
              {members === 1 ? "member" : "members"}
            </Link>
          </Card>
        </div>
      </div>

      <div className="mt-4">
        <SlipDecision
          slipId={slip.id}
          amount={formatLKR(slip.amount)}
          code={code}
          windowHours={settings.slipWindowHours}
        />
      </div>
      {/* Room for the decision bar docked at the bottom on phones. */}
      <div className="h-24 lg:hidden" aria-hidden />
    </>
  );
}

/** Owners who accepted and still have to upload, soonest deadline first. */
async function ExpectedSoon() {
  const carts = await db.groupCart.findMany({
    where: { status: "AWAITING_SLIP" },
    select: { code: true, total: true, slipDueAt: true, owner: { select: { name: true } } },
    orderBy: { slipDueAt: "asc" },
    take: 10,
  });
  if (carts.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">Expected soon</h2>
      <p className="mb-3 text-xs text-subtle">
        These owners accepted and still have to upload a slip.
      </p>
      <ul className="flex flex-col gap-2">
        {carts.map((c) => (
          <li key={c.code}>
            <Link
              href={`/admin/carts/${c.code}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-sm hover:bg-muted"
            >
              <span className="min-w-0">
                <span className="block font-semibold tabular-nums">{formatLKR(c.total)}</span>
                <span className="block truncate text-xs text-subtle">
                  <span className="font-mono">{c.code}</span> · {c.owner.name}
                </span>
              </span>
              <span className="shrink-0 text-xs text-subtle">
                {c.slipDueAt ? <Countdown until={c.slipDueAt.toISOString()} /> : "—"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

type Params = Awaited<PageProps<"/admin/slips">["searchParams"]>;

/** The latest 100 decisions, filtered by result and searched by cart code or owner name. */
async function SlipHistory({ sp }: { sp: Params }) {
  const result = param(sp, "result");
  const q = param(sp, "q");
  const [slips, pending] = await Promise.all([
    db.paymentSlip.findMany({
      where: {
        status:
          result === "approved"
            ? "APPROVED"
            : result === "rejected"
              ? "REJECTED"
              : { in: ["APPROVED", "REJECTED"] },
        ...(q && {
          OR: [
            { cart: { code: { contains: q.toUpperCase() } } },
            { uploader: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }),
      },
      include: {
        cart: { select: { code: true } },
        uploader: { select: { name: true } },
        reviewer: { select: { name: true } },
      },
      orderBy: { reviewedAt: "desc" },
      take: 100,
    }),
    db.paymentSlip.count({ where: { status: "PENDING" } }),
  ]);
  const filtered = Boolean(result || q);
  const tone = (s: (typeof slips)[number]) =>
    s.status === "APPROVED" ? (
      <Badge tone="good">Approved</Badge>
    ) : (
      <Badge tone="bad">Rejected</Badge>
    );

  return (
    <>
      <PageHeader title="Bank slips" />
      <Tabs history pending={pending} />
      <form action="/admin/slips" role="search" className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="view" value="history" />
        <Select
          name="result"
          defaultValue={result ?? ""}
          aria-label="Result"
          className="w-full sm:w-40"
        >
          <option value="">All results</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </Select>
        <Input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Cart code or owner"
          aria-label="Cart code or owner"
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {slips.length === 0 ? (
        <EmptyState title={filtered ? "No slips match" : "No slips reviewed yet"}>
          {filtered && (
            <Link href={hrefWith("/admin/slips", { view: "history" })} className="underline">
              Clear the search
            </Link>
          )}
        </EmptyState>
      ) : (
        <>
          {/* Phones: one card per decision instead of a wide table. */}
          <ul className="flex flex-col gap-2 md:hidden">
            {slips.map((s) => (
              <li key={s.id} className="rounded-xl border border-line p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold tabular-nums">{formatLKR(s.amount)}</span>
                  {tone(s)}
                </div>
                <p className="mt-1 text-xs text-subtle">
                  <Link
                    href={`/admin/carts/${s.cart.code}`}
                    className="font-mono text-accent underline"
                  >
                    {s.cart.code}
                  </Link>{" "}
                  · {s.uploader.name} · {formatDateTime(s.reviewedAt)}
                  {s.reviewer && ` · by ${s.reviewer.name}`}
                </p>
                {s.reviewNote && <p className="mt-1 text-subtle">“{s.reviewNote}”</p>}
                <a
                  href={`/api/slips/${s.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex min-h-9 items-center text-accent underline"
                >
                  Open the slip
                </a>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <Table
              head={
                <>
                  <th>Reviewed</th>
                  <th>Cart</th>
                  <th>Owner</th>
                  <th className="text-right">Amount</th>
                  <th>Result</th>
                  <th>By</th>
                  <th>Note</th>
                  <th>Slip</th>
                </>
              }
            >
              {slips.map((s) => (
                <tr key={s.id}>
                  <td className="text-subtle">{formatDateTime(s.reviewedAt)}</td>
                  <td>
                    <Link
                      href={`/admin/carts/${s.cart.code}`}
                      className="font-mono text-accent underline"
                    >
                      {s.cart.code}
                    </Link>
                  </td>
                  <td>{s.uploader.name}</td>
                  <td className="text-right">{formatLKR(s.amount)}</td>
                  <td>{tone(s)}</td>
                  <td>{s.reviewer?.name ?? "—"}</td>
                  <td className="max-w-64 truncate text-subtle" title={s.reviewNote ?? undefined}>
                    {s.reviewNote ?? ""}
                  </td>
                  <td>
                    <a
                      href={`/api/slips/${s.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent underline"
                    >
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        </>
      )}
    </>
  );
}
