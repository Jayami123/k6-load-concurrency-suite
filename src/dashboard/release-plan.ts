// Where each cited evidence run comes from (plan Phase 4b task 13). Pure: the caller reads the releases and the pending file.
// Every cited run is looked up across all p6-* releases. A run with no zip in any release is pending only when it is on the
// pending list (with its reason); otherwise it is missing and the check fails.

export interface ReleaseAsset {
  tag: string; // the release tag, for example p6-phase4a
  name: string; // the asset name, for example p6-40290101719-evidence.zip
}

export interface PendingRun {
  runId: string;
  reason: string;
}

export interface PendingFile {
  schema: 1;
  release: string; // the release the pending runs are expected in, for example p6-phase4
  pending: PendingRun[];
}

export interface PlannedRun {
  runId: string;
  tag: string;
  zip: string;
}

export interface ReleasePlan {
  fetch: PlannedRun[]; // in a release: downloaded and checked
  pending: PendingRun[]; // not in any release, on the pending list: shown as pending, not failed
  missing: string[]; // not in any release, not pending: the check fails
}

const RUN_ID = /^\d+$/;

/** The zip name a run's evidence is published under. */
export function evidenceZipName(runId: string): string {
  return `p6-${runId}-evidence.zip`;
}

/** Plans each cited run: fetch (found in a release), pending (on the list), or missing. Ids are used once, in cited order. */
export function planRelease(
  citedIds: string[],
  assets: ReleaseAsset[],
  pending: PendingRun[],
): ReleasePlan {
  const plan: ReleasePlan = { fetch: [], pending: [], missing: [] };
  for (const runId of [...new Set(citedIds)]) {
    const zip = evidenceZipName(runId);
    const asset = assets.find((a) => a.name === zip);
    if (asset) {
      plan.fetch.push({ runId, tag: asset.tag, zip });
      continue;
    }
    const waiting = pending.find((p) => p.runId === runId);
    if (waiting) plan.pending.push(waiting);
    else plan.missing.push(runId);
  }
  return plan;
}

/** Validates the parsed pending file: schema 1, a release name, digit-only run ids, each with a reason. */
export function parsePendingFile(value: unknown): PendingFile {
  const t = value as PendingFile;
  if (!t || t.schema !== 1) throw new Error("pending release: schema must be 1");
  if (typeof t.release !== "string" || t.release === "")
    throw new Error("pending release: release must name the expected release");
  if (!Array.isArray(t.pending)) throw new Error("pending release: pending must be a list");
  for (const p of t.pending) {
    if (!RUN_ID.test(p.runId))
      throw new Error(`pending release: run id ${p.runId} is not digits only`);
    if (typeof p.reason !== "string" || p.reason.trim() === "")
      throw new Error(`pending release: run ${p.runId} needs a reason`);
  }
  return t;
}
