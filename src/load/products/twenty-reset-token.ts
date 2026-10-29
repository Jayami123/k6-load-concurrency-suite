import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";
import { closePool } from "../../oracles/pg.ts";
import { redeemResetToken } from "../../twenty/api.ts";
import { createInvitedMember, requestResetToken } from "../../twenty/member.ts";
import { memberCountByPrefix } from "../../twenty/oracle.ts";
import {
  joinTokens,
  publicArtefact,
  publicWording,
  userIdByEmail,
  VERDICT_WORD,
  resetTokenWindow,
  type TokenResult,
} from "../../twenty/oracle-reset-token.ts";
import { freshPassword, throwawayAddress } from "../../twenty/payloads.ts";
import { runResetTokenLoad, successOf } from "../../twenty/reset-token-load.ts";
import { setupTwentyContext, type CaseContext } from "../../twenty/run-case.ts";
import {
  boundaryPremise,
  boundarySchedule,
  expiryBoundaryVerdict,
  IMAGE_DEFAULT_RESET_LIFETIME_MS,
} from "../../twenty/window-oracle.ts";
import { composeStages, reconcileStage } from "../reconcile/index.ts";
import { evaluateVerdict } from "../runner.ts";
import { runAllK6, scanOutDir } from "../stages.ts";
import type { LoadContext, Stage, StageResult, StageSet } from "../types.ts";
import { twentyCleanup, twentySetup } from "./twenty.ts";

/** Redemptions of one token, sent in parallel (Task 5 plan Q1). */
export const REDEEMS_PER_TOKEN = 3;
/** The trials of P6-TW-LOAD-005 start this far apart: 40 tokens over the 300 s full profile, 8 over the 60 s pr profile. */
export const RESET_SPREAD_MS = 7_500;
/** Members of P6-TW-LOAD-011: one before-token and one after-token. */
const BOUNDARY_MEMBERS = 2;
/** The public artefacts. Only verdict-public.json is ever uploaded (it is redacted by construction). */
export const PUBLIC_ROOT = "results/public";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sleepUntil = (ms: number) => sleep(Math.max(0, ms - Date.now()));

/** Tokens of a run: one per RESET_SPREAD_MS of the case's profile. */
export const tokensFor = (ctx: LoadContext): number =>
  Math.round((ctx.profile.durationSec * 1000) / RESET_SPREAD_MS);

/** The case context of the reset loop: its own sign-in and read-only pool, with the run's prefix (members use it). */
async function withCaseContext<T>(
  ctx: LoadContext,
  use: (cctx: CaseContext) => Promise<T>,
): Promise<T> {
  const cctx = await setupTwentyContext();
  try {
    return await use({ ...cctx, prefix: ctx.runPrefix });
  } finally {
    await closePool(cctx.pool);
  }
}

/**
 * Runs the case's k6 processes and the load beside them, and waits for both: a failed load must not leave k6 running
 * when the runner moves on. The load's own error is rethrown as a stage error (TEST BUG).
 */
export function withLoad(load: Stage): Stage {
  return async (ctx) => {
    const [k6, side] = await Promise.allSettled([runAllK6(ctx), load(ctx)]);
    if (side.status === "rejected") throw side.reason;
    if (k6.status === "rejected") throw k6.reason;
    return {
      ok: k6.value.ok && side.value.ok,
      kind: k6.value.kind ?? side.value.kind,
      reasons: [...k6.value.reasons, ...side.value.reasons],
      data: { ...k6.value.data, ...side.value.data },
    };
  };
}

/** P6-TW-LOAD-005: every token is requested and redeemed in parallel under the background load. Results stay in memory. */
export const resetLoopStage: Stage = (ctx) =>
  withCaseContext(ctx, async (cctx) => {
    ctx.handles.resetTokens = await runResetTokenLoad({
      ctx: cctx,
      tokens: tokensFor(ctx),
      redeemsPerToken: REDEEMS_PER_TOKEN,
      spreadMs: RESET_SPREAD_MS,
    });
    return { ok: true, reasons: [] };
  });

/** One redemption: 1 when accepted, 0 when not. The status is kept for the private record only. */
async function redeemOnce(
  cctx: CaseContext,
  token: string,
): Promise<{ successes: number; status: number }> {
  const res = await redeemResetToken(cctx.base, token, freshPassword());
  return { successes: successOf(res) ? 1 : 0, status: res.status };
}

/** The NOT RUN reason of a closed boundary gate (the case's own gate, checked on the issued tokens). */
export const BOUNDARY_GATE_CLOSED = "gate closed: token expiry is above 15 minutes, not run";
/** The INVALID reason when the observed token lifetime disagrees with the recorded one (the gate's premise). */
export const GATE_PREMISE_MISMATCH = "gate premise mismatch";

/** One issued token's window: when it was created and when it expires, in epoch milliseconds. */
export type TokenWindow = { createdAtMs: number; expiresAtMs: number };

/**
 * The gate of P6-TW-LOAD-011 on the issued tokens. A lifetime that disagrees with the recorded value is INVALID (the premise of the
 * gate is wrong). A closed gate is NOT RUN: the outcome is INCONCLUSIVE, unless INVALID outranks it. Returns true when the
 * redemptions may run.
 */
export function checkBoundaryPremise(ctx: LoadContext, windows: TokenWindow[]): boolean {
  const premise = boundaryPremise(windows);
  if (!premise.premiseMatches) {
    const observed = premise.observedLifetimesMs.map((ms) => `${Math.round(ms / 1000)} s`).join(", ");
    ctx.invalid.push(
      `${GATE_PREMISE_MISMATCH}: observed reset token lifetime ${observed}, recorded ${IMAGE_DEFAULT_RESET_LIFETIME_MS / 1000} s`,
    );
  }
  if (!premise.gateOpen) {
    ctx.handles.resetVerdict = "NOT RUN";
    ctx.notRun = [...(ctx.notRun ?? []), BOUNDARY_GATE_CLOSED];
    return false;
  }
  return true;
}

/**
 * P6-TW-LOAD-011: token A is redeemed 15 s before its expiry, token B 15 s after it. The gate is checked first on the issued tokens:
 * an expiry above 15 min closes the case (NOT RUN, INCONCLUSIVE). Expiry comes from the database clock; the wait is on the wall clock only.
 */
export const boundaryStage: Stage = (ctx) =>
  withCaseContext(ctx, async (cctx) => {
    const addresses = [throwawayAddress(cctx.prefix, 0), throwawayAddress(cctx.prefix, 1)];
    for (const address of addresses) await createInvitedMember(cctx, address);
    const tokens: string[] = [];
    for (const address of addresses) tokens.push(await requestResetToken(cctx, address));
    const windows: TokenWindow[] = [];
    for (const address of addresses) {
      windows.push(await resetTokenWindow(cctx.pool, await userIdByEmail(cctx.pool, address)));
    }
    if (!checkBoundaryPremise(ctx, windows)) {
      return { ok: true, reasons: [BOUNDARY_GATE_CLOSED] };
    }
    const [first, second] = windows.map((w) => boundarySchedule(w.expiresAtMs));
    await sleepUntil(first!.beforeMs);
    const before = await redeemOnce(cctx, tokens[0]!);
    await sleepUntil(second!.afterMs);
    const after = await redeemOnce(cctx, tokens[1]!);
    ctx.handles.boundary = { before, after };
    return { ok: true, reasons: [] };
  });

/** Reconcile slot of P6-TW-LOAD-005: the token join. Its reasons are the public wording only (no count). */
export const resetJoinStage: Stage = async (ctx) => {
  const results = ctx.handles.resetTokens as TokenResult[] | undefined;
  if (!results) return { ok: false, kind: "TEST BUG", reasons: ["reset token loop did not finish"] };
  const join = joinTokens(results, tokensFor(ctx));
  ctx.handles.resetVerdict = VERDICT_WORD[join.verdict];
  ctx.handles.resetFindingId = join.findingId;
  // The token path must stay under the reset limit (3 requests per email per 15 min): a 429 makes the run INVALID.
  if (join.limited429 > 0) ctx.invalid.push("reset token path: 429 seen on a redemption");
  const product = join.verdict === "PRODUCT_BUG_SUSPECTED";
  return {
    ok: !product,
    kind: product ? "PRODUCT BUG" : undefined,
    reasons: product ? [publicWording(join)] : [],
    data: { resetToken: join },
  };
};

/** Reconcile slot of P6-TW-LOAD-011: the expiry boundary verdict. A closed gate was already recorded as NOT RUN. */
export const boundaryJoinStage: Stage = async (ctx) => {
  if (ctx.handles.resetVerdict === "NOT RUN") return { ok: true, reasons: [] };
  const boundary = ctx.handles.boundary as
    | { before: { successes: number }; after: { successes: number } }
    | undefined;
  if (!boundary) return { ok: false, kind: "TEST BUG", reasons: ["boundary redemptions did not finish"] };
  const verdict = expiryBoundaryVerdict(boundary.before, boundary.after);
  ctx.handles.resetVerdict = VERDICT_WORD[verdict];
  const product = verdict === "PRODUCT_BUG_SUSPECTED";
  return {
    ok: !product,
    kind: product ? "PRODUCT BUG" : undefined,
    reasons: product ? [VERDICT_WORD[verdict]] : [],
    data: { boundary },
  };
};

/** Reconcile slot: the members of the run equal the members issued (the user leak check, read-only). */
export function memberLeakStage(expected: (ctx: LoadContext) => number): Stage {
  return async (ctx): Promise<StageResult> => {
    const pool = ctx.handles.twentyPool as pg.Pool | undefined;
    if (!pool) return { ok: false, kind: "TEST BUG", reasons: ["setup did not open the oracle pool"] };
    const members = await memberCountByPrefix(pool, ctx.runPrefix);
    if (members !== expected(ctx)) {
      return { ok: false, kind: "TEST BUG", reasons: ["member rows do not match the members issued"] };
    }
    return { ok: true, reasons: [] };
  };
}

/**
 * Token-scan slot (always runs): the output scan of the default stage, then the public artefact. The artefact keeps the verdict
 * word, the finding ID, validity and the environment. It drops every count, stage and token.
 */
export const publicResultStage: Stage = async (ctx) => {
  const scan = await scanOutDir(ctx);
  const doc = publicArtefact(
    {
      caseId: ctx.caseDef.id,
      runId: ctx.runId,
      outcome: (ctx.handles.resetVerdict as string | undefined) ?? "NOT RUN",
      runOutcome: evaluateVerdict(ctx).outcome,
      validity: ctx.invalid.length === 0 ? "VALID" : "INVALID",
      findingId: ctx.handles.resetFindingId as string | undefined,
    },
    { environment: { kind: ctx.meta?.environment.kind ?? "local", sha: ctx.meta?.environment.sha } },
  );
  const dir = path.join(PUBLIC_ROOT, ctx.caseDef.id, ctx.runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "verdict-public.json"), `${JSON.stringify(doc, null, 2)}\n`);
  return scan;
};

/** Stage set of P6-TW-LOAD-005. */
export const RESET_TOKEN_STAGES: Partial<StageSet> = {
  setup: twentySetup,
  k6: withLoad(resetLoopStage),
  reconcile: composeStages([reconcileStage, memberLeakStage(tokensFor), resetJoinStage]),
  cleanup: twentyCleanup,
  tokenScan: publicResultStage,
};

/** Stage set of P6-TW-LOAD-011. */
export const BOUNDARY_STAGES: Partial<StageSet> = {
  setup: twentySetup,
  k6: withLoad(boundaryStage),
  reconcile: composeStages([
    reconcileStage,
    memberLeakStage(() => BOUNDARY_MEMBERS),
    boundaryJoinStage,
  ]),
  cleanup: twentyCleanup,
  tokenScan: publicResultStage,
};
