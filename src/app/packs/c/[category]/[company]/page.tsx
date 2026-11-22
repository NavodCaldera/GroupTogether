import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { listPacks } from "@/server/packs";

export default async function CompanyPage({ params }: PageProps<"/packs/c/[category]/[company]">) {
  const data = await listPacks((await params).company);
  if (!data) notFound();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <PageHeader title={data.company.name} actions={data.company.demo ? <Badge>Demo</Badge> : null} />
      {data.packs.length === 0 ? (
        <EmptyState title="No packs yet" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.packs.map((p) => {
            const v = p.versions[0];
            return (
              <li key={p.slug}>
                <Link href={`/packs/p/${p.slug}`}>
                  <Card className="flex flex-col gap-1 hover:bg-muted">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-sm">{p.durationDays} days</span>
                    <span className="text-sm">{v.groupSize} family packs per group</span>
                    <span className="text-sm">{v._count.items} items in each family pack</span>
                    <span className="font-semibold">{formatLKR(v.pricePerFamily)} per family</span>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
