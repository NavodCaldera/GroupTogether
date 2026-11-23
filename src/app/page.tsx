import Link from "next/link";
import { CompanyLogo, EmptyState } from "@/components/ui";
import { homeCategories } from "@/server/packs";

/** Home (DEC-030): companies grouped under their categories. */
export default async function HomePage() {
  const categories = await homeCategories();

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl bg-accent/10 px-4 py-5 sm:px-6">
        <h1 className="text-xl font-semibold sm:text-2xl">
          Direct factory to consumer. No more middle man.
        </h1>
      </section>
      {categories.length === 0 ? <EmptyState title="No companies yet" /> : null}
      {categories.map((c) => (
        <section key={c.slug} aria-labelledby={`cat-${c.slug}`}>
          <h2 id={`cat-${c.slug}`} className="mb-3 text-lg font-semibold">
            {c.name}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {c.companies.map((co) => (
              <li key={co.slug}>
                <Link
                  href={`/companies/${co.slug}`}
                  className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-line bg-paper p-4 text-center transition hover:border-accent hover:bg-muted"
                >
                  <CompanyLogo name={co.name} logo={co.logo} />
                  <span className="text-xs text-subtle">
                    {co.packs} {co.packs === 1 ? "pack" : "packs"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
