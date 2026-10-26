// The verdict stages of P6-CAL-LOAD-002 and P6-CAL-LOAD-006 (plan Phase 4b task 8 §6.2, §6.3). They read the P6_BURST and P6_POLL lines
// of the k6 log, the accepted rows on the target slot, and the summary's dropped iterations, then write burst.json or stale.json.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { calDatabaseUrlFromEnv } from "../../races/env.ts";
import { closePool, createReadOnlyPool, selectRows } from "../../oracles/pg.ts";
import { summaryCounter } from "../reconcile/index.ts";
import type { FindingKind, LoadContext, Stage, StageResult } from "../types.ts";
import { classifyBurst, type BurstAttempt, type BurstVerdict } from "./burst.ts";
import { classifyStale, type StalePoll } from "./stale.ts";

/** The ACCEPTED bookings on the target slot of this run's prefix (SLOT_ACCEPTED_SQL, src/cal/oracle.ts, counted for the run). */
export const ACCEPTED_ON_SLOT_SQL = `SELECT count(*)::int AS n FROM "Booking" b
WHERE b."startTime" = $1::timestamptz AND b.status = 'accepted'
  AND EXISTS (SELECT 1 FROM "Attendee" a WHERE a."bookingId" = b.id AND a.email LIKE $2)`;

/**
 * The JSON that follows a marker on each k6 log line. k6 writes console output as logfmt (`msg="<marker>{...}" source=console`), so the
 * JSON is cut at the closing quote and its escaped quotes are unescaped.
 */
export function markedLines<T>(logPath: string, marker: string): T[] {
  const out: T[] = [];
  for (const line of readFileSync(logPath, "utf8").split("\n")) {
    const at = line.indexOf(marker);
    if (at === -1) continue;
    const rest = line.slice(at + marker.length);
    const end = rest.lastIndexOf('" source=');
    const json = end === -1 ? rest : rest.slice(0, end);
    out.push(JSON.parse(json.replace(/\\"/g, '"')) as T);
  }
  return out;
}

const KIND: Record<BurstVerdict["verdict"], FindingKind | undefined> = {
  PASS: undefined,
  "FAIL (PRODUCT BUG)": "PRODUCT BUG",
  "TEST BUG": "TEST BUG",
  INVALID: "INVALID",
};

async function acceptedOn(slot: string, prefixLike: string): Promise<number> {
  const pool = createReadOnlyPool(calDatabaseUrlFromEnv());
  try {
    const [row] = await selectRows<{ n: number }>(pool, ACCEPTED_ON_SLOT_SQL, [slot, prefixLike]);
    return row?.n ?? 0;
  } finally {
    await closePool(pool);
  }
}

function mainRun(ctx: LoadContext) {
  return ctx.k6.find((k) => k.label === "main") ?? ctx.k6[0];
}

/** P6-CAL-LOAD-002: the burst classifier over the attempts of the run (plan §6.2). */
export const calBurstStage: Stage = async (ctx: LoadContext): Promise<StageResult> => {
  const slot = String(ctx.config.burstSlot ?? "");
  const audit = ctx.config.audit as { prefixLike: string } | undefined;
  const main = mainRun(ctx);
  if (!main || !audit || slot === "")
    return {
      ok: false,
      kind: "TEST BUG",
      reasons: ["burst stage: no target slot, audit config or k6 run"],
    };
  const attempts = markedLines<BurstAttempt & { requestStartMs: number }>(
    main.stdoutPath,
    "P6_BURST ",
  );
  const summary = JSON.parse(readFileSync(main.summaryPath, "utf8"));
  const verdict = classifyBurst({
    targetSlot: slot,
    accepted: await acceptedOn(slot, audit.prefixLike),
    attempts: attempts.map((a) => ({ intent: a.intent, status: a.status, bodyKind: a.bodyKind })),
    expectedAttempts: Number(ctx.config.burstAttempts ?? 8),
    droppedIterations: summaryCounter(summary, "dropped_iterations") ?? 0,
    requestStartMs: attempts.map((a) => a.requestStartMs),
    slotFreeAtSetup: true, // the target was taken from the offered list at setup (pickSlotStarts)
    fiveXx: attempts.filter((a) => (a.status ?? 0) >= 500).length,
  });
  writeFileSync(path.join(ctx.outDir, "burst.json"), `${JSON.stringify(verdict, null, 2)}\n`);
  const kind = KIND[verdict.verdict];
  if (kind === undefined)
    return { ok: true, reasons: verdict.reasons, data: { burst: verdict.verdict } };
  return { ok: false, kind, reasons: verdict.reasons, data: { burst: verdict.verdict } };
};

/** P6-CAL-LOAD-006: the stale-read classifier over the polls after the commit (plan §6.3). The contract is never-offered-again: the cache is inactive in CI (C8-1). */
export const calStaleStage: Stage = async (ctx: LoadContext): Promise<StageResult> => {
  const slot = String(ctx.config.burstSlot ?? "");
  const audit = ctx.config.audit as { prefixLike: string } | undefined;
  const main = mainRun(ctx);
  if (!main || !audit || slot === "")
    return {
      ok: false,
      kind: "TEST BUG",
      reasons: ["stale stage: no target slot, audit config or k6 run"],
    };
  const commit = markedLines<{
    intent: string;
    status: number | null;
    bodyKind: string;
    requestStartMs: number;
  }>(main.stdoutPath, "P6_BURST ").find(
    (a) => a.intent.includes("stale") && a.bodyKind === "accepted",
  );
  if (commit === undefined)
    return {
      ok: false,
      kind: "TEST BUG",
      reasons: ["stale: no accepted commit on the target slot"],
    };
  const polls = markedLines<StalePoll>(main.stdoutPath, "P6_POLL ");
  const accepted = await acceptedOn(slot, audit.prefixLike);
  const verdict = classifyStale({
    contract: "never-offered-again",
    commitMs: commit.requestStartMs,
    polls,
    pollsExpected: Number(ctx.config.polls ?? 30),
    ttlMs: 2000,
    marginMs: 1000,
    secondAcceptedOnS: accepted > 1,
  });
  writeFileSync(path.join(ctx.outDir, "stale.json"), `${JSON.stringify(verdict, null, 2)}\n`);
  if (verdict.verdict.startsWith("PASS"))
    return { ok: true, reasons: verdict.reasons, data: { stale: verdict.verdict } };
  const kind: FindingKind = verdict.verdict === "TEST BUG" ? "TEST BUG" : "PRODUCT BUG";
  return { ok: false, kind, reasons: verdict.reasons, data: { stale: verdict.verdict } };
};
