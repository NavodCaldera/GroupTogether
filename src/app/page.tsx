import Link from "next/link";
import { CompanyLogo, EmptyState } from "@/components/ui";
import { redirectCompany } from "@/server/auth/session";
import { homeCategories } from "@/server/packs";

/** Home (DEC-030): companies grouped under their categories. */
export default async function HomePage() {
  await redirectCompany();
  const categories = await homeCategories();

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl bg-muted px-4 py-8 text-center sm:px-8 sm:py-12">
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-4xl">
          Direct factory to consumer. <span className="text-accent">No more middle man.</span>
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
                  className="flex h-full min-h-28 items-center justify-center rounded-xl border border-line bg-paper p-4 transition hover:border-accent hover:shadow-sm"
                >
                  <CompanyLogo name={co.name} logo={co.logo} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
