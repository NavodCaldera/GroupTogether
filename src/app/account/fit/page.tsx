import type { Metadata } from "next";
import { BackLink } from "@/components/client";
import { Card, PageHeader } from "@/components/ui";
import { readBody } from "@/lib/fit/data";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { getBodyProfile } from "@/server/fit";
import { FitOnboarding, type ProfileValues } from "./fit-onboarding";

export const metadata: Metadata = { title: "My measurements" };

/** The buyer's body profile for fit reports (DEC-020). */
export default async function FitPage({ searchParams }: PageProps<"/account/fit">) {
  const sp = await searchParams;
  const next =
    typeof sp.next === "string" && /^\/products\/[a-z0-9]{1,40}$/.test(sp.next) ? sp.next : "";
  const user = await requireUser([...BUYER_ROLES], `/account/fit${next ? `?next=${next}` : ""}`);
  const p = await getBodyProfile(user.id);
  const stored = p ? (p.measurements as Record<string, { source?: string }>) : {};
  const profile: ProfileValues | null = p
    ? {
        heightCm: p.heightCm,
        gender: p.gender,
        ageBand: p.ageBand,
        measurements: Object.fromEntries(
          Object.entries(readBody(p.measurements)).map(([k, m]) => [
            k,
            { ...m, source: stored[k]?.source === "photo" ? "photo" : "typed" },
          ]),
        ),
      }
    : null;
  return (
    <div className="mx-auto w-full max-w-2xl">
      <BackLink fallback={next || "/account"} />
      <PageHeader title="My measurements" />
      <Card>
        <FitOnboarding profile={profile} next={next} />
      </Card>
    </div>
  );
}
