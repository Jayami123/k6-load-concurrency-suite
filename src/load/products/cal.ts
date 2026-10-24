import type pg from "pg";
import { caseDataPrefix } from "../../../k6/lib/pure/prefix.js";
import { cancelBooking } from "../../cal/api.ts";
import { caseLiveBookings, leakCheck, resolveHostSetup } from "../../cal/oracle.ts";
import { likeLiteralPrefix } from "../../medusa/payloads.ts";
import { closePool, createReadOnlyPool } from "../../oracles/pg.ts";
import { calBaseUrlFromEnv, calDatabaseUrlFromEnv } from "../../races/env.ts";
import { loadRepoEnv } from "../env.ts";
import type { LoadContext, StageResult } from "../types.ts";

/** The product dependencies, injectable so the tests run without a database or a Cal server. */
export interface CalDeps {
  openPool: () => pg.Pool;
  cancel: (uid: string) => Promise<void>;
}

const defaultDeps: CalDeps = {
  openPool: () => createReadOnlyPool(calDatabaseUrlFromEnv()),
  cancel: cancelBooking,
};

const message = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).slice(0, 200);

/** 11.4 slots per day at pro/30min (plan §3.1); three spare days cover the start offset. */
export function calWindowDays(planned: number): number {
  return Math.ceil(planned / 11.4) + 3;
}

/** Resolves the host and event type from the database and writes the case config. Never writes a secret. */
export async function calSetupWith(ctx: LoadContext, deps: CalDeps): Promise<StageResult> {
  loadRepoEnv();
  const pool = deps.openPool();
  try {
    const { userId, eventTypeId } = await resolveHostSetup(pool);
    const dataPrefix = caseDataPrefix(ctx.runPrefix, ctx.caseDef.id);
    const { rate, durationSec, maxLatencyMs } = ctx.profile;
    const planned = Math.round(rate * durationSec);
    ctx.config = {
      baseUrl: calBaseUrlFromEnv(),
      eventTypeId,
      eventTypeSlug: "30min",
      host: "pro",
      prefix: dataPrefix,
      windowDays: calWindowDays(planned),
      rate,
      durationSec,
      maxLatencyMs,
    };
    ctx.config.audit = {
      product: "cal",
      userId,
      eventTypeId,
      prefixLike: likeLiteralPrefix(dataPrefix),
    };
    return { ok: true, reasons: [] };
  } catch (err) {
    return { ok: false, kind: "TEST BUG", reasons: [`cal setup failed: ${message(err)}`] };
  } finally {
    await closePool(pool);
  }
}

/**
 * Cancels every live booking of the case, found by the database (never by the uids k6 returned: a client that timed out
 * never learns its uid). A failed cancel is a TEST BUG line and the sweep continues; the leak check runs last.
 */
export async function calCleanupWith(ctx: LoadContext, deps: CalDeps): Promise<StageResult> {
  const reasons: string[] = [];
  const pool = deps.openPool();
  try {
    const prefixLike = likeLiteralPrefix(caseDataPrefix(ctx.runPrefix, ctx.caseDef.id));
    const rows = await caseLiveBookings(pool, prefixLike);
    for (const row of rows) {
      try {
        await deps.cancel(row.uid);
      } catch (err) {
        reasons.push(`TEST BUG: cancel booking ${row.id} failed: ${message(err)}`);
      }
    }
    reasons.push(...(await leakCheck(pool, prefixLike)));
  } catch (err) {
    reasons.push(`TEST BUG: cal cleanup failed: ${message(err)}`);
  } finally {
    await closePool(pool);
  }
  return reasons.length === 0
    ? { ok: true, reasons: [] }
    : { ok: false, kind: "TEST BUG", reasons };
}

export const calSetup = (ctx: LoadContext): Promise<StageResult> => calSetupWith(ctx, defaultDeps);
export const calCleanup = (ctx: LoadContext): Promise<StageResult> =>
  calCleanupWith(ctx, defaultDeps);
