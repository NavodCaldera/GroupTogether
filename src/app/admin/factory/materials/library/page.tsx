import type { Metadata } from "next";
import { param, Table } from "@/app/admin/list-bits";
import { Badge, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/server/auth/session";
import {
  listCalibrationSets,
  listEvidence,
  listLabs,
  listRules,
  listSources,
} from "@/server/material-admin";
import { MaterialsNav } from "../materials-nav";

export const metadata: Metadata = { title: "Material library" };

const VIEWS = {
  sources: "Sources",
  evidence: "Evidence",
  rules: "Rules",
  labs: "Labs",
  calibration: "Calibration",
} as const;
type View = keyof typeof VIEWS;

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

/**
 * The library's provenance tables (DEC-022), read-only: they are edited in `seeds/` and loaded
 * with `npm run materials:load`, so each change is reviewed in git.
 */
export default async function LibraryPage({
  searchParams,
}: PageProps<"/admin/factory/materials/library">) {
  await requireAdmin("FACTORY");
  const raw = param(await searchParams, "view");
  const view: View = raw && raw in VIEWS ? (raw as View) : "sources";
  return (
    <>
      <PageHeader title={VIEWS[view]} />
      <MaterialsNav active={VIEWS[view]} />
      {view === "sources" && <Sources />}
      {view === "evidence" && <Evidence />}
      {view === "rules" && <Rules />}
      {view === "labs" && <Labs />}
      {view === "calibration" && <Calibration />}
    </>
  );
}

async function Sources() {
  const rows = await listSources();
  return (
    <Table
      head={
        <>
          <th>Code</th>
          <th>Source</th>
          <th>Tier</th>
          <th>Read on</th>
          <th>Evidence</th>
        </>
      }
    >
      {rows.map((s) => (
        <tr key={s.code}>
          <td>{s.code}</td>
          <td className="max-w-md truncate">
            <a href={s.url} className="underline" target="_blank" rel="noopener noreferrer">
              {s.title}
            </a>
            <span className="block text-xs text-subtle">{s.publisher}</span>
          </td>
          <td>{s.tier}</td>
          <td>{day(s.accessedOn)}</td>
          <td className="tabular-nums">{s._count.evidence}</td>
        </tr>
      ))}
    </Table>
  );
}

async function Evidence() {
  const rows = await listEvidence();
  return (
    <Table
      head={
        <>
          <th>Code</th>
          <th>Subject</th>
          <th>Claim</th>
          <th>Source</th>
          <th>Quote</th>
        </>
      }
    >
      {rows.map((e) => (
        <tr key={e.code}>
          <td>{e.code}</td>
          <td>
            {e.subjectType} {e.subjectCode}
            <span className="block text-xs text-subtle">{e.attribute}</span>
          </td>
          <td className="max-w-md whitespace-normal">{e.claim}</td>
          <td>
            <a href={e.source.url} className="underline" target="_blank" rel="noopener noreferrer">
              {e.source.code}
            </a>{" "}
            · {e.source.tier}
          </td>
          <td className="max-w-sm whitespace-normal">
            {e.excerpt ? (
              <q className="text-subtle">{e.excerpt}</q>
            ) : (
              <Badge tone="neutral">None: not used</Badge>
            )}
          </td>
        </tr>
      ))}
    </Table>
  );
}

async function Rules() {
  const rows = await listRules();
  return (
    <Table
      head={
        <>
          <th>Rule</th>
          <th>Axis</th>
          <th>Formula</th>
          <th>What it does</th>
        </>
      }
    >
      {rows.map((r) => (
        <tr key={r.id}>
          <td>
            {r.code} v{r.version}
          </td>
          <td>{r.attribute}</td>
          <td className="max-w-xs whitespace-normal">{r.formula}</td>
          <td className="max-w-lg whitespace-normal text-subtle">{r.ruleDescription}</td>
        </tr>
      ))}
    </Table>
  );
}

async function Labs() {
  const rows = await listLabs();
  return (
    <Table
      head={
        <>
          <th>Lab</th>
          <th>Accreditation</th>
          <th>Scope checked</th>
          <th>Tests in scope</th>
          <th>Results</th>
        </>
      }
    >
      {rows.map((l) => (
        <tr key={l.id}>
          <td>
            {l.name}
            <span className="block text-xs text-subtle">{l.city}</span>
          </td>
          <td>{l.accreditationNo ?? "—"}</td>
          <td>{day(l.scopeVerifiedOn)}</td>
          <td className="max-w-xs whitespace-normal">
            {l.scope.length ? l.scope.join(", ") : <Badge tone="neutral">None checked</Badge>}
          </td>
          <td className="tabular-nums">{l._count.measurements}</td>
        </tr>
      ))}
    </Table>
  );
}

async function Calibration() {
  const sets = await listCalibrationSets();
  if (!sets.length)
    return <p className="text-sm text-subtle">No reference swatch set yet: measured sliders are off.</p>;
  return (
    <Table
      head={
        <>
          <th>Set</th>
          <th>Active</th>
          <th>Swatches</th>
          <th>Results</th>
        </>
      }
    >
      {sets.map((s) => (
        <tr key={s.id}>
          <td>
            {s.name} v{s.version}
          </td>
          <td>{day(s.activeAt)}</td>
          <td className="tabular-nums">{s.swatches.length}</td>
          <td className="tabular-nums">
            {s.swatches.reduce((n, w) => n + w._count.measurements, 0)}
          </td>
        </tr>
      ))}
    </Table>
  );
}
