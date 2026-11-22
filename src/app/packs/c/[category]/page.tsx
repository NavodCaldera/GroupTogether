import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { listCompanies } from "@/server/packs";

export default async function CategoryPage({ params }: PageProps<"/packs/c/[category]">) {
  const data = await listCompanies((await params).category);
  if (!data) notFound();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <PageHeader title={data.category.name} />
      {data.companies.length === 0 ? (
        <EmptyState title="No companies yet" />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {data.companies.map((c) => (
            <li key={c.slug}>
              <Link href={`/packs/c/${data.category.slug}/${c.slug}`}>
                <Card className="flex items-center justify-between gap-2 hover:bg-muted">
                  <span className="font-medium">{c.name}</span>
                  {c.demo ? <Badge>Demo</Badge> : null}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
