import { requirePacker } from "@/server/auth/session";

/** Packing staff only (CLAUDE.md rule 17). Built for phones held in one hand. */
export default async function PackingLayout({ children }: LayoutProps<"/packing">) {
  await requirePacker();
  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">{children}</div>;
}
