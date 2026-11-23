import Link from "next/link";
import { CompanyLogo, EmptyState } from "@/components/ui";
import { homeCategories } from "@/server/packs";

/** Home (DEC-030): companies grouped under their categories. */
export default async function HomePage() {
  const categories = await homeCategories();

  return (
    <div className="flex flex-col gap-8">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent to-accent/70 px-5 py-8 text-on-accent sm:px-10 sm:py-12">
        <h1 className="max-w-xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
          Direct factory to consumer.
          <span className="mt-1 block text-on-accent/80">No more middle man.</span>
        </h1>
        <svg
          viewBox="0 0 120 48"
          aria-hidden="true"
          className="mt-6 h-10 w-auto fill-none stroke-current stroke-2 opacity-90 sm:absolute sm:right-10 sm:bottom-10 sm:mt-0 sm:h-16 [stroke-linecap:round] [stroke-linejoin:round]"
        >
          <path d="M4 44V22l10 6v-6l10 6v-6l10 6V8h6v36z" />
          <path d="M48 30h36m-6-6 6 6-6 6" />
          <path d="M94 44V28l12-10 12 10v16zm8 0v-8h8v8" />
        </svg>
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
