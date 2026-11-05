import type { listReturnMessages } from "@/server/returns";
import { formatDateTime } from "@/lib/format";
import { ReturnForm } from "./return-form";
export function ReturnThread({
  id,
  messages,
  canPost,
}: {
  id: string;
  messages: Awaited<ReturnType<typeof listReturnMessages>>;
  canPost: boolean;
}) {
  return (
    <section
      aria-label="Return messages"
      className="flex min-w-0 flex-col gap-3 border-t border-line pt-3"
    >
      <h3 className="font-semibold">Messages</h3>
      <ol className="flex min-w-0 flex-col gap-3">
        {messages.map((m) => (
          <li key={m.id} className="min-w-0 break-words">
            <p className="font-semibold">{m.author.name}</p>
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>
            <time className="text-sm text-subtle">{formatDateTime(m.createdAt)}</time>
          </li>
        ))}
      </ol>
      {canPost && <ReturnForm id={id} op="message" />}
    </section>
  );
}
