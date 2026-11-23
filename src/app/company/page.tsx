import type { Metadata } from "next";
import Link from "next/link";
import { ImageForm, PackEditor } from "@/components/company-forms";
import { Badge, Card, CompanyLogo, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatLKR } from "@/lib/format";
import { companyDashboard, requireCompany } from "@/server/company";

export const metadata: Metadata = { title: "Company" };

const STATUS = { ORDERED: "Ordered", DISPATCHED: "Dispatched", RECEIVED: "Received" } as const;

export default async function CompanyDashboard() {
  const c = await companyDashboard(await requireCompany());

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <PageHeader
        title={c.name}
        actions={
          <Link className="text-sm font-medium underline" href={`/companies/${c.slug}`}>
            View page
          </Link>
        }
      />

      <section aria-labelledby="brand" className="flex flex-col gap-4">
        <h2 id="brand" className="text-lg font-semibold">
          Brand
        </h2>
        <Card className="flex flex-col gap-5">
          {c.banner ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.banner} alt="" className="aspect-[4/1] w-full rounded-lg object-cover" />
          ) : null}
          <ImageForm target="banner" label="Banner" />
          <CompanyLogo name={c.name} logo={c.logo} className="self-start" />
          <ImageForm target="logo" label="Logo" />
        </Card>
      </section>

      <section aria-labelledby="packs" className="flex flex-col gap-4">
        <h2 id="packs" className="text-lg font-semibold">
          Standard packs
        </h2>
        {c.packs.map((p) => {
          const v = p.versions[0];
          return (
            <Card key={p.id} className="flex flex-col gap-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">{p.name}</h3>
                {v ? <Badge>Version {v.version}</Badge> : null}
              </div>
              {p.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.photo}
                  alt=""
                  className="aspect-video w-full max-w-sm rounded-lg object-cover"
                />
              ) : null}
              <ImageForm target={p.id} label={`${p.name} photo`} />
              {v ? (
                <PackEditor
                  packId={p.id}
                  price={v.pricePerFamily.toFixed(2)}
                  discounts={{
                    discount5: v.discount5.toString(),
                    discount10: v.discount10.toString(),
                    discount15: v.discount15.toString(),
                  }}
                  items={v.items}
                />
              ) : null}
            </Card>
          );
        })}
      </section>

      <section aria-labelledby="orders" className="flex flex-col gap-4">
        <h2 id="orders" className="text-lg font-semibold">
          Orders
        </h2>
        {c.deliveries.length === 0 ? (
          <EmptyState title="No orders yet" />
        ) : (
          <ul className="flex flex-col gap-3">
            {c.deliveries.map((d) => (
              <li key={d.id}>
                <Card className="flex flex-col gap-1 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">{d.group.version.pack.name}</span>
                    <Badge tone={d.status === "RECEIVED" ? "good" : "info"}>
                      {STATUS[d.status]}
                    </Badge>
                  </div>
                  <span>
                    {d.families} families · {formatDate(d.createdAt)}
                  </span>
                  <span>
                    {d.group.createdBy.name}
                    {d.group.createdBy.phone ? ` · ${d.group.createdBy.phone}` : ""}
                  </span>
                  <span className="text-subtle">
                    {d.group.address}
                    {d.group.city ? `, ${d.group.city}` : ""}
                  </span>
                  <span className="font-semibold">Due {formatLKR(d.amountDue)}</span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
