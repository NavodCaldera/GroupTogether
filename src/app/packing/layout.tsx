import { EmptyState, PageHeader } from "@/components/ui";
import { factoryFulfilment } from "@/lib/fulfilment";
import { requirePacker } from "@/server/auth/session";

/**
 * Packing staff only (CLAUDE.md rule 17). Built for phones held in one hand. Parked while the
 * factories pack their own orders (product owner, 2026-11-03); accounts and history are kept.
 */
export default async function PackingLayout({ children }: LayoutProps<"/packing">) {
  await requirePacker();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {factoryFulfilment() ? (
        <div>
          <PageHeader title="Packing" />
          <EmptyState title="Packing is paused" />
        </div>
      ) : (
        children
      )}
    </div>
  );
}
