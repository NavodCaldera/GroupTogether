import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, EmptyState } from "@/components/ui";
import { getCurrentUser } from "@/server/auth/session";
import { homeCategories } from "@/server/packs";

/** Home (DEC-030): companies grouped under their categories. */
export default async function HomePage() {
  // Admins and factory logins have their own back office.
  const user = await getCurrentUser();
  if (user?.role === "ADMIN") redirect("/admin");
  if (user?.role === "SELLER") redirect("/seller");
  const categories = await homeCategories();

  if (categories.length === 0) return <EmptyState title="No companies yet" />;
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Family packs</h1>
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
                  className="flex h-full flex-col items-center gap-2 rounded-xl border border-line bg-paper p-4 text-center transition hover:border-accent hover:bg-muted"
                >
                  <span
                    aria-hidden
                    className="grid size-14 place-items-center rounded-full bg-accent/15 text-lg font-bold text-ink"
                  >
                    {initials(co.name)}
                  </span>
                  <span className="font-medium leading-tight">{co.name}</span>
                  <span className="text-xs text-subtle">
                    {co.packs} {co.packs === 1 ? "pack" : "packs"}
                  </span>
                  {co.demo ? <Badge>Demo</Badge> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
