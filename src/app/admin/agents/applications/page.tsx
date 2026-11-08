import type { Metadata } from "next";
import { Alert, Badge, Card, EmptyState, Field, Input, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { agentApplications } from "@/server/agents/admin-screens";
import { requireAdmin } from "@/server/auth/session";
import { AdminForm } from "../../admin-form";
import { decideAgentAction } from "../actions";
import { MapPin } from "../agent-bits";

export const metadata: Metadata = { title: "Agent applications" };

const km = (n: number) => `${n.toFixed(1)} km`;

export default async function AgentApplicationsPage() {
  const admin = await requireAdmin("AGENTS");
  const { applied, approved, agentGapM } = await agentApplications(admin.id);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Applications" />
      {applied.length === 0 && <EmptyState title="No applications" />}
      <ul className="flex flex-col gap-4 empty:hidden">
        {applied.map((a) => {
          const photo = (k: string) => `/api/agent-photos/${a.id}?k=${k}`;
          const photos: [string, string][] = [
            ["photo", `${a.user.name}: photo`],
            ["nic", `${a.user.name}: NIC`],
            ...Array.from({ length: a.storagePhotos }, (_, i): [string, string] => [
              `s${i}`,
              `${a.user.name}: storage ${i + 1}`,
            ]),
          ];
          return (
            <li key={a.id}>
              <Card className="flex min-w-0 flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">{a.user.name}</h2>
                    <p className="text-sm break-words">
                      {a.user.phone} · {a.user.email}
                    </p>
                    <p className="text-sm text-subtle">
                      {a.address}
                      {a.city ? `, ${a.city}` : ""} · {formatDateTime(a.updatedAt)}
                    </p>
                  </div>
                  <Badge>Applied</Badge>
                </div>
                {a.clash && a.nearest && (
                  <Alert>
                    Clash: {a.nearest.name}, {km(a.nearest.km)} (gap {km(agentGapM / 1000)})
                  </Alert>
                )}
                {!a.clash && a.nearest && (
                  <p className="text-sm">
                    Nearest agent: {a.nearest.name}, {km(a.nearest.km)}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  <MapPin lat={a.lat} lng={a.lng} label={a.address} />
                  {photos.map(([k, alt]) => (
                    <a
                      key={k}
                      href={photo(k)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block size-48 shrink-0 overflow-hidden rounded-lg border border-line bg-muted"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo(k)}
                        alt={alt}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    </a>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <AdminForm action={decideAgentAction} submit="Approve">
                    <input type="hidden" name="agentId" value={a.id} />
                    <input type="hidden" name="decision" value="approve" />
                  </AdminForm>
                  <AdminForm action={decideAgentAction} submit="Reject" variant="danger">
                    <input type="hidden" name="agentId" value={a.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <Field label="Reason" name={`reason-${a.id}`}>
                      <Input id={`reason-${a.id}`} name="note" maxLength={500} required />
                    </Field>
                  </AdminForm>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      {approved.length > 0 && (
        <section aria-labelledby="deposit-due" className="flex flex-col gap-3">
          <h2 id="deposit-due" className="text-lg font-semibold">
            Deposit due ({approved.length})
          </h2>
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {approved.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-3 px-3 py-2">
                <span className="font-medium">{a.user.name}</span>
                <span className="min-w-0 flex-1 text-sm text-subtle">{a.address}</span>
                <span className="text-xs text-subtle">{formatDateTime(a.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
