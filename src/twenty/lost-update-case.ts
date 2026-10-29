// P6-TW-LOAD-004 (lost update under sustained edits): the case definition. Setup signs in and creates the run's API key through
// the foundation stages (§2.12, §2.13), then creates the 11 records and gives each one setup write (employees = 0).
import type { LoadCase, LoadContext, StageResult } from "../load/types.ts";
import { twentyCleanup, twentySetup } from "../load/products/twenty.ts";
import { createCompany, patchCompany } from "./api.ts";
import {
  T4_INITIAL_EMPLOYEES,
  T4_SETUP_RECORDS,
  lostUpdateStage,
  t4ReconcileStage,
  type T4Config,
} from "./oracle-lost-update.ts";
import { composeStages } from "../load/reconcile/index.ts";

/** Attempts per second per writer and stage (plan Load shape). `pr` runs stage 1 only, `full` runs all three. */
export const T4_STAGE_RATES = { pr: [0.5], full: [0.5, 1, 1.5] } as const;
/** Each stage lasts 120 s (plan Load shape). The writers are open-model scenarios, one per stage. */
export const T4_STAGE_SEC = 120;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Setup: the foundation setup, then the 11 records (5 for variant A, 6 for variant B) with one setup write each. */
export async function tw004Setup(ctx: LoadContext): Promise<StageResult> {
  const setup = await twentySetup(ctx);
  if (!setup.ok) return setup;
  const url = ctx.config.baseUrl as string;
  const auth = ctx.handles.twentyAuth as string;
  const prefix = ctx.config.prefix as string;
  const a: string[] = [];
  const b: string[] = [];
  try {
    for (let n = 0; n < 5; n += 1)
      a.push(await createSetupRecord(url, auth, `${prefix}-t4-a-${n}`));
    for (let stage = 1; stage <= 3; stage += 1) {
      for (let n = 0; n < 2; n += 1) {
        b.push(await createSetupRecord(url, auth, `${prefix}-t4-b-s${stage}-${n}`));
      }
    }
  } catch (err) {
    return {
      ok: false,
      kind: "TEST BUG",
      reasons: [`tw-load-004 setup failed: ${errorMessage(err)}`],
    };
  }
  const t4: T4Config = {
    records: { a, b },
    stageRates: [...T4_STAGE_RATES[ctx.profileName === "full" ? "full" : "pr"]],
    stageSec: T4_STAGE_SEC,
    initialEmployees: T4_INITIAL_EMPLOYEES,
  };
  ctx.config.t4 = t4;
  return {
    ok: true,
    reasons: [],
    data: { records: a.length + b.length, setupRecords: T4_SETUP_RECORDS },
  };
}

/** One record: created with the run prefix, then given its setup write (employees = 0), which is not an intent. */
async function createSetupRecord(url: string, auth: string, name: string): Promise<string> {
  const created = await createCompany(url, auth, name);
  if (!created.id) throw new Error(`createCompany answered ${created.status}`);
  const set = await patchCompany(url, auth, created.id, { employees: 0 });
  if (set.status !== 200) throw new Error(`setup write answered ${set.status}`);
  return created.id;
}

/** The k6 run: one main process; the API-key secret is forwarded by name, never written to a file. */
export const TW_LOAD_004: LoadCase = {
  id: "P6-TW-LOAD-004",
  title: "Twenty lost update under sustained edits",
  product: "twenty",
  label: "functional load, not capacity",
  telemetry: { product: "twenty" },
  profiles: {
    pr: { rate: 1, durationSec: 120, maxLatencyMs: 4000 },
    full: { rate: 1, durationSec: 360, maxLatencyMs: 4000 },
  },
  runs: (ctx) =>
    ctx.invalid.length > 0
      ? []
      : [
          {
            label: "main",
            script: "k6/cases/tw-load-004.js",
            env: {},
            secretEnv: ["TWENTY_API_KEYS"],
          },
        ],
  stages: {
    setup: tw004Setup,
    reconcile: composeStages([t4ReconcileStage, lostUpdateStage]),
    cleanup: twentyCleanup,
  },
};
