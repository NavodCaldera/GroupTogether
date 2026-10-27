"use client";
import { useActionState, useRef } from "react";
import { useRouter } from "next/navigation";
import { sendBrandMessageAction } from "@/server/brand-communication-actions";
import { Button } from "./ui";
export function BrandMessageForm({ children }: { children: React.ReactNode }) {
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (previous: Awaited<ReturnType<typeof sendBrandMessageAction>>, fd: FormData) => {
      const result = await sendBrandMessageAction(previous, fd);
      if (result.thread) {
        form.current?.reset();
        const key = form.current?.elements.namedItem("requestKey") as HTMLInputElement | null;
        if (key) key.value = crypto.randomUUID();
        router.push(
          `${result.admin ? "/admin/brands" : "/seller"}?tab=messages&thread=${encodeURIComponent(result.thread)}`,
        );
        router.refresh();
      }
      return result;
    },
    {},
  );
  return (
    <form ref={form} action={action} className="flex flex-col gap-4">
      {children}
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
