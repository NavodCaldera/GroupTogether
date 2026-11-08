import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader, Select, cx } from "@/components/ui";
import { BrandInbox, searchValue } from "@/components/brand-inbox";
import { BrandProductReview } from "@/components/brand-product-review";
import { BrandLiveUpdates } from "@/components/brand-live-updates";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { brandInbox, subjectHref } from "@/server/brand-communications";
import { BrandOperations } from "./operations";
export const metadata: Metadata = { title: "Brand rewards" };
export default async function BrandRewardsPage({ searchParams }: PageProps<"/admin/brands">) {
  const admin = await requireAdmin("PREMIUM");
  const search = await searchParams;
  // Gift orders and settlements are parked with the old baskets: their tabs are hidden.
  const allowed = ["overview", "brands", "products", "messages"];
  const tab = allowed.includes(searchValue(search, "tab"))
    ? searchValue(search, "tab")
    : "overview";
  const brand = searchValue(search, "brand");
  const brands = await db.user.findMany({
    where: { role: "SELLER", isBrand: true },
    select: {
      id: true,
      name: true,
      company: true,
      email: true,
      phone: true,
      website: true,
      locked: true,
      _count: { select: { stockOffers: true } },
    },
    orderBy: { company: "asc" },
  });
  const scope = brand ? { sellerId: brand } : {};
  const [inbox, reviews] = await Promise.all([
    brandInbox(admin.id, brand || undefined),
    db.brandOfferRevision.count({
      where: {
        status: "IN_REVIEW",
        supersededAt: null,
        offer: { ...scope, seller: { isBrand: true } },
      },
    }),
  ]);
  const unread = inbox.reduce((sum, thread) => sum + thread.unread, 0);
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Brand rewards"
        description="Products, fulfilment, payments and partnership conversations"
      />
      {tab !== "messages" && <BrandLiveUpdates />}
      <nav
        aria-label="Brand admin workspace"
        className="grid grid-cols-2 gap-1 border-b border-line pb-2 text-sm sm:flex sm:flex-wrap"
      >
        {[
          ["overview", "Overview"],
          ["brands", "Brands"],
          ["products", "Gift products"],
          ["messages", "Messages"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`/admin/brands?tab=${key}${brand ? `&brand=${encodeURIComponent(brand)}` : ""}`}
            aria-current={tab === key ? "page" : undefined}
            className={cx(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4",
              tab === key ? "bg-accent text-on-accent font-medium" : "text-subtle hover:bg-muted",
            )}
          >
            {label}
            {key === "products" && reviews > 0 && <span>{reviews}</span>}
            {key === "messages" && unread > 0 && <Badge tone="info">{unread}</Badge>}
          </Link>
        ))}
      </nav>
      <form className="flex flex-wrap gap-2">
        <input type="hidden" name="tab" value={tab} />
        <Select name="brand" aria-label="Filter by brand" defaultValue={brand}>
          <option value="">All brands</option>
          {brands.map((partner) => (
            <option key={partner.id} value={partner.id}>
              {partner.company || partner.name}
            </option>
          ))}
        </Select>
        <button className="min-h-11 rounded-lg border border-line px-4 text-sm">
          Apply filter
        </button>
      </form>
      {tab === "overview" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Products to review", reviews, "products"],
              ["Unread messages", unread, "messages"],
              [
                "Needs reply",
                inbox.filter((thread) => thread.needsReply).length,
                "messages&filter=reply",
              ],
            ].map(([label, value, target]) => (
              <Link
                key={label}
                href={`/admin/brands?tab=${target}${brand ? `&brand=${encodeURIComponent(brand)}` : ""}`}
                className="rounded-xl border border-line bg-paper p-4"
              >
                <p className="text-xs text-subtle">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
              </Link>
            ))}
          </div>
          <Card className="text-sm text-subtle">
            Review eligibility and gift bills explicitly. A brand can dispatch a gift after basket
            payment approval; recording a transfer preserves the amount and included gift bills.
          </Card>
        </>
      )}
      {tab === "brands" && (
        <div className="grid gap-4 md:grid-cols-2">
          {brands
            .filter((partner) => !brand || partner.id === brand)
            .map((partner) => (
              <Card key={partner.id} className="flex flex-col gap-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <h2 className="font-semibold">{partner.company || partner.name}</h2>
                  <Badge tone={partner.locked ? "bad" : "good"}>
                    {partner.locked ? "Locked" : "Active"}
                  </Badge>
                </div>
                <p className="text-sm text-subtle">
                  {partner.name} · {partner.email}
                  {partner.phone ? ` · ${partner.phone}` : ""}
                </p>
                <p className="text-sm">{partner._count.stockOffers} gift products</p>
                {partner.website && (
                  <a
                    href={partner.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent break-all"
                  >
                    {partner.website}
                  </a>
                )}
                <div className="flex flex-wrap gap-4">
                  <Link
                    href={`/admin/brands?tab=products&brand=${partner.id}`}
                    className="inline-flex min-h-11 items-center text-sm text-accent"
                  >
                    Review products →
                  </Link>
                  {!partner.locked && (
                    <Link
                      href={subjectHref(true, "GENERAL", "general", partner.id)}
                      className="inline-flex min-h-11 items-center text-sm text-accent"
                    >
                      Message brand →
                    </Link>
                  )}
                </div>
              </Card>
            ))}
        </div>
      )}
      {tab === "products" && <BrandProductReview search={search} />}
      {(tab === "orders" || tab === "settlements") && (
        <BrandOperations search={{ ...search, tab }} />
      )}
      {tab === "messages" && <BrandInbox actorId={admin.id} search={search} />}
    </div>
  );
}
