import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { signOutAction } from "@/server/auth/actions";
import type { SessionUser } from "@/server/auth/service";
import { packerToday } from "@/server/packing";

/**
 * Profile for packing staff (CLAUDE.md rule 17): who they are, what they did today, and sign
 * out. No address form; an admin keeps their details. Fewest words, built for a phone.
 */
export async function PackerProfile({ user }: { user: SessionUser }) {
  const today = await packerToday(user.id);
  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <>
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="grid size-14 shrink-0 place-items-center rounded-full bg-accent text-lg font-semibold text-on-accent"
          >
            {initials || "?"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{user.name}</p>
            <p className="text-sm text-subtle">Packing staff</p>
          </div>
        </div>
        <dl className="divide-y divide-line border-t border-line text-sm">
          <div className="flex items-center justify-between gap-3 py-3">
            <dt className="text-subtle">Email</dt>
            <dd className="min-w-0 truncate">{user.email}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <dt className="text-subtle">Mobile</dt>
            <dd className="tabular-nums">{user.phone ?? "—"}</dd>
          </div>
        </dl>
      </Card>

      <section aria-labelledby="today" className="flex flex-col gap-2">
        <h2 id="today" className="text-sm font-semibold">
          Today
        </h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat n={today.gathered} label="Gathered" />
          <Stat n={today.packed} label="Packed" />
          <Stat n={today.handedOver} label="Handed over" />
        </div>
      </section>

      <Link
        href="/packing"
        className="inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-4 font-medium text-on-accent hover:opacity-90"
      >
        Open packing list
      </Link>

      <form action={signOutAction} className="mt-2 border-t border-line pt-4">
        <Button variant="secondary" className="min-h-12 w-full text-danger">
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          Sign out
        </Button>
      </form>
    </>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-2xl font-semibold tabular-nums">{n}</p>
      <p className="text-xs text-subtle">{label}</p>
    </div>
  );
}
