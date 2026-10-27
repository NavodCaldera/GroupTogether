import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, EmptyState, Field, Input, Select, Textarea } from "./ui";
import { RewardForm } from "./reward-form";
import { BrandLiveUpdates } from "./brand-live-updates";
import { BrandMessageForm } from "./brand-message-form";
import { BrandThreadHistory } from "./brand-thread-history";
import { BrandSubjectDetails } from "./brand-subject-details";
import { CatalogueError } from "@/server/catalogue";
import { db } from "@/server/db";
import {
  brandInbox,
  communicationActor,
  contextForThread,
  conversationHref,
  subjectContext,
} from "@/server/brand-communications";
import { resolveBrandThreadAction } from "@/server/brand-communication-actions";
import { formatDateTime } from "@/lib/format";
export type BrandSearch = Record<string, string | string[] | undefined>;
export const searchValue = (search: BrandSearch, key: string) =>
  typeof search[key] === "string" ? (search[key] as string) : "";

export async function BrandInbox({ actorId, search }: { actorId: string; search: BrandSearch }) {
  const actor = await communicationActor(actorId);
  const admin = actor.role === "ADMIN";
  const brandId = admin ? searchValue(search, "brand") : actorId;
  const threads = await brandInbox(actorId, brandId || undefined);
  const q = searchValue(search, "q").trim().toLowerCase();
  const filtered = threads.filter(
    (thread) =>
      (!q ||
        `${thread.title} ${thread.brand.company || thread.brand.name}`.toLowerCase().includes(q)) &&
      (searchValue(search, "filter") !== "reply" || thread.needsReply) &&
      (searchValue(search, "filter") !== "unread" || thread.unread > 0),
  );
  const selectedId = searchValue(search, "thread");
  const kind = searchValue(search, "kind") || "GENERAL";
  let context;
  try {
    context = selectedId
      ? await contextForThread(actor, selectedId)
      : brandId
        ? await subjectContext(actor, brandId, kind, searchValue(search, "subject") || "general")
        : null;
  } catch (error) {
    if (error instanceof CatalogueError) notFound();
    throw error;
  }
  const conversation = context
    ? await db.brandConversation.findUnique({ where: { contextKey: context.contextKey } })
    : null;
  const messages = conversation
    ? (
        await db.brandMessage.findMany({
          where: { conversationId: conversation.id, ...(!admin ? { internal: false } : {}) },
          include: { author: { select: { name: true, role: true } } },
          orderBy: { createdAt: "desc" },
          take: searchValue(search, "history") === "all" ? undefined : 200,
        })
      ).reverse()
    : [];
  const reads = conversation
    ? await db.brandConversationRead.findMany({
        where: {
          conversationId: conversation.id,
          userId: admin ? conversation.brandId : { not: actorId },
        },
      })
    : [];
  const brands = admin
    ? await db.user.findMany({
        where: { isBrand: true, role: "SELLER", locked: false },
        select: { id: true, company: true, name: true },
        orderBy: { company: "asc" },
      })
    : [];
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <BrandLiveUpdates />
      <form className="flex flex-wrap gap-2" role="search">
        <input type="hidden" name="tab" value="messages" />
        {brandId && <input type="hidden" name="brand" value={brandId} />}
        <Input
          name="q"
          placeholder="Search conversations"
          aria-label="Search conversations"
          defaultValue={searchValue(search, "q")}
          className="min-w-0 basis-full sm:flex-1 sm:basis-0"
        />
        <Select
          name="filter"
          aria-label="Message filter"
          defaultValue={searchValue(search, "filter")}
        >
          <option value="">All conversations</option>
          <option value="unread">Unread</option>
          <option value="reply">Needs reply</option>
        </Select>
        <button className="min-h-11 rounded-lg border border-line px-4 text-sm">Search</button>
      </form>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex max-h-64 min-w-0 flex-col gap-2 overflow-y-auto lg:max-h-[85vh]">
          {filtered.map((thread) => (
            <Link
              key={thread.id}
              href={conversationHref(admin, thread.id)}
              prefetch={false}
              className={`rounded-xl border p-3 text-sm ${conversation?.id === thread.id ? "border-accent bg-accent/10" : "border-line"}`}
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span className="text-xs text-subtle">
                  {admin ? thread.brand.company || thread.brand.name : thread.kind}
                </span>
                {thread.unread > 0 && <Badge tone="info">{thread.unread} unread</Badge>}
              </div>
              <p className="mt-1 font-medium break-words">{thread.title}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {thread.needsReply && <Badge>Needs reply</Badge>}
                {thread.resolved && <Badge tone="good">Resolved</Badge>}
              </div>
            </Link>
          ))}
          {!filtered.length && <EmptyState title="No matching conversations" />}
        </aside>
        <Card className="flex min-w-0 flex-col gap-4">
          <div>
            <h2 className="font-semibold">{context?.title || "New partnership conversation"}</h2>
            {context && (
              <p className="mt-1 text-xs text-subtle">
                {context.brandName} · {context.summary || "General"}
              </p>
            )}
          </div>
          {context && <BrandSubjectDetails context={context} admin={admin} />}
          {conversation && (
            <RewardForm
              action={resolveBrandThreadAction}
              submit={conversation.resolved ? "Reopen conversation" : "Mark resolved"}
              secondary
            >
              <input type="hidden" name="thread" value={conversation.id} />
              <input type="hidden" name="resolved" value={conversation.resolved ? "0" : "1"} />
            </RewardForm>
          )}
          <BrandThreadHistory
            key={conversation?.id || "new"}
            thread={conversation?.id}
            through={messages.at(-1)?.createdAt.toISOString()}
          >
            {messages.map((message) => (
              <li
                key={message.id}
                className={`rounded-lg border p-3 text-sm ${message.internal ? "border-ink border-dashed" : "border-line"}`}
              >
                <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs text-subtle">
                  <span>
                    {message.system
                      ? message.requestKey?.startsWith("legacy-")
                        ? "Imported record"
                        : `Event · ${message.author.name}`
                      : message.author.role === "ADMIN"
                        ? `GroupBasket · ${message.author.name}`
                        : message.author.name}
                  </span>
                  <span>{formatDateTime(message.createdAt)}</span>
                </div>
                {message.internal && <Badge>Internal · GroupBasket only</Badge>}
                <p className="mt-1 whitespace-pre-wrap break-words">{message.body}</p>
                {!message.system && message.authorId === actorId && !message.internal && (
                  <p className="mt-1 text-xs text-subtle">
                    {reads.some((read) => read.readAt >= message.createdAt) ? "Seen" : "Sent"}
                  </p>
                )}
              </li>
            ))}
            {!messages.length && <li className="p-3 text-sm text-subtle">No messages yet</li>}
          </BrandThreadHistory>
          {messages.length === 200 && conversation && searchValue(search, "history") !== "all" && (
            <Link
              href={`${conversationHref(admin, conversation.id)}&history=all`}
              className="text-sm text-accent"
            >
              Load full conversation history →
            </Link>
          )}
          <BrandMessageForm key={context?.contextKey || "new"}>
            {conversation && <input type="hidden" name="thread" value={conversation.id} />}
            <input type="hidden" name="requestKey" value={randomUUID()} />
            <input type="hidden" name="kind" value={context?.kind || "GENERAL"} />
            <input type="hidden" name="subjectId" value={context?.subjectId || "general"} />
            {context ? (
              <input type="hidden" name="brandId" value={context.brandId} />
            ) : (
              <Field label="Brand" name="brandId">
                <Select name="brandId" required defaultValue="">
                  <option value="" disabled>
                    Choose brand
                  </option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.company || brand.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Message" name="body">
              <Textarea name="body" minLength={1} maxLength={2000} rows={3} required />
            </Field>
            {admin && (
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input name="internal" type="checkbox" className="size-4 accent-accent" />
                Internal note · GroupBasket only
              </label>
            )}
          </BrandMessageForm>
        </Card>
      </div>
    </section>
  );
}
