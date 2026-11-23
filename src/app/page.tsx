import Link from "next/link";
import { CompanyLogo, EmptyState } from "@/components/ui";
import { redirectCompany } from "@/server/auth/session";
import { homeCompanies } from "@/server/packs";

/** Home (DEC-030): every company. */
export default async function HomePage() {
  await redirectCompany();
  const companies = await homeCompanies();

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl bg-muted px-4 py-8 text-center sm:px-8 sm:py-12">
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-4xl">
          Direct factory to consumer. <span className="text-accent">No more middle man.</span>
        </h1>
      </section>
      {companies.length === 0 ? <EmptyState title="No companies yet" /> : null}
      {companies.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {companies.map((co) => (
            <li key={co.slug}>
              <Link
                href={`/companies/${co.slug}`}
                className="flex h-full min-h-28 items-center justify-center rounded-xl text-center border border-line bg-paper p-4 transition hover:border-accent hover:shadow-sm"
              >
                <CompanyLogo name={co.name} logo={co.logo} />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
