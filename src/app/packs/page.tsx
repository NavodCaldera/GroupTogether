import Link from "next/link";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { listPackCategories } from "@/server/packs";

export default async function PacksPage() {
  const categories = await listPackCategories();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <PageHeader
        title="Family packs"
        actions={
          <LinkButton variant="secondary" href="/my-groups">
            My groups
          </LinkButton>
        }
      />
      {categories.length === 0 ? (
        <EmptyState title="No packs yet" />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link href={`/packs/c/${c.slug}`}>
                <Card className="font-medium hover:bg-muted">{c.name}</Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
