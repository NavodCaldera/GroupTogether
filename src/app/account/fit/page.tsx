import type { Metadata } from "next";
import { BackLink } from "@/components/client";
import { Card, PageHeader } from "@/components/ui";
import { readBody } from "@/lib/fit/data";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { bodyFitEnabled, getBodyModel } from "@/server/body-fit";
import { getBodyProfile } from "@/server/fit";
import { BodyCheck } from "./body-check";
import { FitOnboarding, type ProfileValues } from "./fit-onboarding";

export const metadata: Metadata = { title: "My measurements" };

/** Fit and age group from sign-up: an adult's gender and age band, or nothing. */
function startFrom(gender: string | null, birthDate: Date | null) {
  const age = birthDate
    ? Math.floor((Date.now() - birthDate.getTime()) / (365.2425 * 86_400_000))
    : null;
  const ageBand =
    age == null || age < 18
      ? null
      : age < 30
        ? "18-29"
        : age < 45
          ? "30-44"
          : age < 60
            ? "45-59"
            : "60+";
  const adult = ageBand !== null;
  return {
    gender: adult && gender === "MALE" ? "MEN" : adult && gender === "FEMALE" ? "WOMEN" : null,
    ageBand,
  };
}

/** The buyer's body profile for fit reports (DEC-020). */
export default async function FitPage({ searchParams }: PageProps<"/account/fit">) {
  const sp = await searchParams;
  const next =
    typeof sp.next === "string" && /^\/products\/[a-z0-9]{1,40}$/.test(sp.next) ? sp.next : "";
  const user = await requireUser([...BUYER_ROLES], `/account/fit${next ? `?next=${next}` : ""}`);
  const [p, body] = await Promise.all([getBodyProfile(user.id), getBodyModel(user.id)]);
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
    <div className="mx-auto flex w-full max-w-2xl flex-col">
      <BackLink fallback={next || "/account"} />
      <PageHeader title="My measurements" />
      {body && (
        <Card className="mb-4">
          <BodyCheck body={body} />
        </Card>
      )}
      <FitOnboarding
        profile={profile}
        start={startFrom(user.gender, user.birthDate)}
        next={next}
        body3d={bodyFitEnabled()}
      />
    </div>
  );
}
