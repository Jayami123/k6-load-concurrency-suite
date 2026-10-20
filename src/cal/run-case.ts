import type pg from "pg";
import { fireTogether, summariseBody } from "../races/fire-together.ts";
import { runTrials } from "../races/run-trials.ts";
import {
  aggregateDispatchSpread,
  createHistogram,
  mergeStatusCounts,
  writeHistogram,
} from "../races/histogram.ts";
import { recordTrial } from "../races/trial-record.ts";
import { calBaseUrlFromEnv, raceMaxSpreadMsFromEnv } from "../races/env.ts";
import type { RaceHistogram, RaceRequestResult, RaceTrialResult } from "../races/types.ts";
import {
  caseLeakPattern,
  casePrefix,
  cleanupFailure,
  likeLiteralPrefix,
} from "../medusa/payloads.ts";
import { cancelBooking, createBooking, type createSlotAllocator } from "./api.ts";
import {
  checkIdenticalSlotInvariants,
  checkOverlapPairGuards,
  classifyLoser,
  classifyOverlapLoser,
  doubleBookSummary,
  overlapViolations,
  refusedLegs,
  type OverlapLoserKind,
  type LoserKind,
  type ParsedResponse,
} from "./invariants.ts";
import {
  caseLiveBookings,
  leakCheck,
  readOverlapPairs,
  readSlotAccepted,
  readWindowAccepted,
} from "./oracle.ts";
import {
  attendeeEmail,
  bookingBody,
  overlapLegs,
  overlapShapeForTrial,
  parseBookingResponse,
  timeSpellings,
  windowsOverlap,
  type OverlapLeg,
  type OverlapShape,
} from "./payloads.ts";

export type IdenticalSlotMode = "distinct" | "sameAttendee" | "spellings";

const LOSER_KINDS: LoserKind[] = [
  "slot-taken",
  "booking-conflict",
  "db-unique-redacted",
  "unexpected",
];

function makeCanceller(cleanupViolations: string[]) {
  return async (uid: string, cancelled: Set<string>) => {
    if (cancelled.has(uid)) return;
    cancelled.add(uid);
    try {
      await cancelBooking(uid);
    } catch (err) {
      cleanupViolations.push(cleanupFailure("booking", uid, err));
    }
  };
}

function failedTrialRecords(
  trialResults: Array<{ trial: number; ok: boolean; error?: string }>,
  perTrial: RaceTrialResult[],
): RaceTrialResult[] {
  const recorded = new Set(perTrial.map((t) => t.trial));
  return trialResults
    .filter((t) => !t.ok && !recorded.has(t.trial))
    .map((failed) => ({
      trial: failed.trial,
      ok: false,
      statuses: [],
      statusCounts: {},
      dispatchSpreadMs: 0,
      oracle: {},
      invariantViolations: failed.error ? [failed.error] : [],
      error: failed.error,
    }));
}

async function sweepAndLeakCheck(
  pool: pg.Pool,
  leakPattern: string,
  cancelQuietly: (uid: string, cancelled: Set<string>) => Promise<void>,
): Promise<{ leak: string[]; leakAccepted: number }> {
  const sweepCancelled = new Set<string>();
  for (const row of await caseLiveBookings(pool, leakPattern)) {
    await cancelQuietly(row.uid, sweepCancelled);
  }
  const leak = await leakCheck(pool, leakPattern);
  const leakAccepted = (await caseLiveBookings(pool, leakPattern)).length;
  return { leak, leakAccepted };
}

export async function runIdenticalSlotCase(input: {
  pool: pg.Pool;
  setup: { userId: number; eventTypeId: number };
  slots: ReturnType<typeof createSlotAllocator>;
  runPrefix: string;
  caseId: string;
  title: string;
  n: number;
  mode: IdenticalSlotMode;
  trials: number;
}): Promise<{ histogram: RaceHistogram; responses: ParsedResponse[] }> {
  const spreadLimit = raceMaxSpreadMsFromEnv();
  const base = calBaseUrlFromEnv();
  const dataPrefix = casePrefix(input.runPrefix, input.caseId);
  const leakPattern = caseLeakPattern(input.runPrefix, input.caseId);
  const histogram = createHistogram({
    caseId: input.caseId,
    title: input.title,
    product: "cal",
    concurrency: input.n,
    trials: input.trials,
  });

  const spreads: number[] = [];
  const perTrial: RaceTrialResult[] = [];
  const allResponses: ParsedResponse[] = [];
  const cleanupViolations: string[] = [];
  const loserTotals: Record<LoserKind, number> = {
    "slot-taken": 0,
    "booking-conflict": 0,
    "db-unique-redacted": 0,
    unexpected: 0,
  };
  let acceptedTotal = 0;
  let leakAccepted = 0;

  const cancelQuietly = makeCanceller(cleanupViolations);

  try {
    const trialResults = await runTrials(input.trials, async (trial) => {
      const cancelled = new Set<string>();
      const winnerUids: string[] = [];
      let slotStart = "";

      try {
        const slot = await input.slots.next();
        slotStart = slot.start;
        const rawBodies: string[] = Array.from({ length: input.n }, () => "");
        const spelled = timeSpellings(slot.start);
        const spelledEnd = timeSpellings(slot.end);

        const fired = await fireTogether(
          input.n,
          async (i) => {
            const leaf =
              input.mode === "sameAttendee"
                ? `t${trial}-same`
                : `t${trial}-c${String(i).padStart(2, "0")}`;
            const result = await createBooking(
              bookingBody({
                start: input.mode === "spellings" ? spelled[i % 3]! : slot.start,
                end: input.mode === "spellings" ? spelledEnd[i % 3]! : slot.end,
                email: attendeeEmail(dataPrefix, leaf),
                name:
                  input.mode === "sameAttendee" ? "p6 same" : `p6 c${String(i).padStart(2, "0")}`,
                eventTypeId: input.setup.eventTypeId,
              }),
            );
            rawBodies[i] = result.body;
            return result;
          },
          {
            warm: async () => {
              const res = await fetch(`${base}/api/csrf`);
              await res.text();
            },
          },
        );

        const responses = fired.requests.map((r, i) =>
          parseBookingResponse(r.status, rawBodies[i] || r.error || ""),
        );
        for (const r of responses) {
          if (r.status !== null && r.status >= 200 && r.status < 300 && r.uid)
            winnerUids.push(r.uid);
        }
        allResponses.push(...responses);

        const accepted = await readSlotAccepted(
          input.pool,
          input.setup.userId,
          slot.start,
          slot.end,
        );

        const kinds = {
          "slot-taken": 0,
          "booking-conflict": 0,
          "db-unique-redacted": 0,
          unexpected: 0,
        };
        for (const r of responses) {
          if (r.status === null || (r.status >= 200 && r.status < 300)) continue;
          kinds[classifyLoser(r.status, r.message)] += 1;
        }
        for (const k of LOSER_KINDS) loserTotals[k] += kinds[k];
        acceptedTotal += accepted.length;

        const record = recordTrial(trial, fired, () => {
          const violations = checkIdenticalSlotInvariants({
            n: input.n,
            responses,
            accepted,
            dispatchSpreadMs: fired.dispatchSpreadMs,
            spreadLimit,
          });
          if (violations.length > 0) throw new Error(violations.join("; "));
        });

        const winners = responses.filter(
          (r) => r.status !== null && r.status >= 200 && r.status < 300,
        );
        record.oracle = {
          slotStart: slot.start,
          acceptedCount: accepted.length,
          httpWinners: winners.length,
          winnerUidMatches:
            winners.length === 1 && accepted.length > 0 && winners[0]!.uid === accepted[0]!.uid,
          hasIdempotencyKey: accepted.length > 0 && accepted.every((a) => a.hasKey),
          slotRowsTotal: accepted.length,
          "loser_slot-taken": kinds["slot-taken"],
          "loser_booking-conflict": kinds["booking-conflict"],
          "loser_db-unique-redacted": kinds["db-unique-redacted"],
          loser_unexpected: kinds.unexpected,
        };

        perTrial.push(record);
        spreads.push(record.dispatchSpreadMs);
        mergeStatusCounts(histogram.statusCounts, record.statusCounts);

        if (!record.ok) throw new Error(record.error);
      } finally {
        for (const uid of winnerUids) await cancelQuietly(uid, cancelled);
        if (slotStart) {
          const live = await caseLiveBookings(input.pool, leakPattern).catch(() => []);
          for (const row of live) {
            if (row.start === slotStart) await cancelQuietly(row.uid, cancelled);
          }
        }
      }
    });

    perTrial.push(...failedTrialRecords(trialResults, perTrial));

    histogram.perTrial = perTrial.sort((a, b) => a.trial - b.trial);
    histogram.dispatchSpreadMs = aggregateDispatchSpread(spreads);

    // Sweep: cancel anything of this case still holding a slot, then the leak check wants 0.
    const swept = await sweepAndLeakCheck(input.pool, leakPattern, cancelQuietly);
    const leak = swept.leak;
    leakAccepted = swept.leakAccepted;

    histogram.oracle = {
      hostUserId: input.setup.userId,
      eventTypeId: input.setup.eventTypeId,
      "loser_slot-taken": loserTotals["slot-taken"],
      "loser_booking-conflict": loserTotals["booking-conflict"],
      "loser_db-unique-redacted": loserTotals["db-unique-redacted"],
      loser_unexpected: loserTotals.unexpected,
      acceptedTotal,
      leakAccepted,
    };
    histogram.invariantViolations.push(...cleanupViolations, ...leak);

    const trialsOk = trialResults.every((t) => t.ok);
    histogram.verdict = trialsOk && histogram.invariantViolations.length === 0 ? "pass" : "fail";
  } finally {
    histogram.finishedAt = new Date().toISOString();
    await writeHistogram(histogram);
  }

  return { histogram, responses: allResponses };
}

export type OverlapRunMode = "race" | "sequential";

/** Sequential control shapes by trial % 4: 1 A, 2 B, 3 C, 0 D (plan §6.1). */
function sequentialPlan(trial: number): { shape: OverlapShape; order: Array<"60" | "30"> } {
  switch (trial % 4) {
    case 1:
      return { shape: "same-start", order: ["60", "30"] };
    case 2:
      return { shape: "inside", order: ["60", "30"] };
    case 3:
      return { shape: "same-start", order: ["30", "60"] };
    default:
      return { shape: "inside", order: ["30", "60"] };
  }
}

export async function runOverlapPairCase(input: {
  pool: pg.Pool;
  setup: { userId: number; eventTypeId30: number; eventTypeId60: number };
  windows: ReturnType<typeof createSlotAllocator>; // 60-min allocator
  runPrefix: string;
  caseId: string;
  title: string;
  mode: OverlapRunMode;
  trials: number;
}): Promise<{
  histogram: RaceHistogram;
  guardViolations: string[];
  overlapPairs: number;
  doubleBook: ReturnType<typeof doubleBookSummary>; // D16
}> {
  const spreadLimit = raceMaxSpreadMsFromEnv();
  const base = calBaseUrlFromEnv();
  const dataPrefix = casePrefix(input.runPrefix, input.caseId);
  const leakPattern = caseLeakPattern(input.runPrefix, input.caseId);
  const histogram = createHistogram({
    caseId: input.caseId,
    title: input.title,
    product: "cal",
    concurrency: 2,
    trials: input.trials,
  });

  const spreads: number[] = [];
  const perTrial: RaceTrialResult[] = [];
  const cleanupViolations: string[] = [];
  const guardViolations: string[] = [];
  const pairsByTrial: number[] = Array.from({ length: input.trials }, () => 0);
  const refusedTraceIds: string[] = [];
  const loserTotals: Record<OverlapLoserKind, number> = {
    "slot-taken": 0,
    "booking-conflict": 0,
    "refused-db-error": 0,
    unexpected: 0,
  };
  const outcomes = { both: 0, "60_only": 0, "30_only": 0, none: 0 };
  let overlapPairs = 0;
  let leakAccepted = 0;

  const cancelQuietly = makeCanceller(cleanupViolations);

  try {
    const trialResults = await runTrials(input.trials, async (trial) => {
      const cancelled = new Set<string>();
      const winnerUids: string[] = [];
      const trialPattern = likeLiteralPrefix(`${dataPrefix}-t${trial}-`);

      try {
        const window = await input.windows.next();
        const seq = input.mode === "sequential" ? sequentialPlan(trial) : null;
        const shape = seq ? seq.shape : overlapShapeForTrial(trial);
        const [leg60, leg30] = overlapLegs(window.start, shape, input.setup);
        const legs: OverlapLeg[] = seq
          ? seq.order.map((role) => (role === "60" ? leg60 : leg30))
          : [leg60, leg30];
        if (!windowsOverlap(legs[0]!.start, legs[0]!.end, legs[1]!.start, legs[1]!.end)) {
          throw new Error("TEST BUG: legs do not overlap");
        }

        const rawBodies: string[] = ["", ""];
        const book = async (i: number) => {
          const leg = legs[i]!;
          const result = await createBooking(
            bookingBody({
              start: leg.start,
              end: leg.end,
              email: attendeeEmail(dataPrefix, `t${trial}-r${leg.role}`),
              name: `p6 r${leg.role}`,
              eventTypeId: leg.eventTypeId,
              eventTypeSlug: leg.eventTypeSlug,
            }),
          );
          rawBodies[i] = result.body;
          return result;
        };

        let fired: { requests: RaceRequestResult[]; dispatchSpreadMs: number };
        if (input.mode === "race") {
          fired = await fireTogether(2, (i) => book(i), {
            warm: async () => {
              const res = await fetch(`${base}/api/csrf`);
              await res.text();
            },
          });
        } else {
          const requests: RaceRequestResult[] = [];
          for (let i = 0; i < 2; i++) {
            const startedAtMs = performance.now();
            try {
              const { status, body } = await book(i);
              requests.push({
                index: i,
                status,
                bodySummary: summariseBody(status, body),
                startedAtMs,
                endedAtMs: performance.now(),
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              requests.push({
                index: i,
                status: null,
                bodySummary: summariseBody(null, message),
                startedAtMs,
                endedAtMs: performance.now(),
                error: message,
              });
            }
          }
          fired = { requests, dispatchSpreadMs: 0 };
        }

        const responses = fired.requests.map((r, i) =>
          parseBookingResponse(r.status, rawBodies[i] || r.error || ""),
        );
        const winnerRoles: string[] = [];
        responses.forEach((r, i) => {
          if (r.status !== null && r.status >= 200 && r.status < 300) {
            winnerRoles.push(legs[i]!.role);
            if (r.uid) winnerUids.push(r.uid);
          }
        });

        const windowAccepted = await readWindowAccepted(
          input.pool,
          input.setup.userId,
          window.start,
          window.end,
          trialPattern,
        );
        const pairs = await readOverlapPairs(input.pool, input.setup.userId, trialPattern);

        const guards = checkOverlapPairGuards({
          responses,
          windowAccepted,
          dispatchSpreadMs: fired.dispatchSpreadMs,
          spreadLimit,
        });
        if (input.mode === "sequential" && winnerRoles.length === 2) {
          guards.push("PRODUCT BUG: sequential overlap accepted");
        }
        const product = overlapViolations(pairs);

        const kinds: Record<OverlapLoserKind, number> = {
          "slot-taken": 0,
          "booking-conflict": 0,
          "refused-db-error": 0,
          unexpected: 0,
        };
        for (const r of responses) {
          if (r.status === null || (r.status >= 200 && r.status < 300)) continue;
          kinds[classifyOverlapLoser(r.status, r.message)] += 1;
        }
        for (const k of Object.keys(kinds) as OverlapLoserKind[]) loserTotals[k] += kinds[k];
        const refused = refusedLegs(responses).map((l) => l.traceId);
        refusedTraceIds.push(...refused.map((id) => `t${trial}:${id}`));

        const winners = winnerRoles.includes("60")
          ? winnerRoles.includes("30")
            ? "60+30"
            : "60"
          : winnerRoles.includes("30")
            ? "30"
            : "none";
        if (winners === "60+30") outcomes.both += 1;
        else if (winners === "60") outcomes["60_only"] += 1;
        else if (winners === "30") outcomes["30_only"] += 1;
        else outcomes.none += 1;

        const record = recordTrial(trial, fired, () => {
          if (guards.length || product.length) {
            throw new Error([...guards, ...product].join("; "));
          }
        });
        record.oracle = {
          windowStart: window.start,
          shape,
          httpWinners: winnerRoles.length,
          windowAccepted: windowAccepted.length,
          overlapPairs: pairs.length,
          doubleBooked: pairs.length > 0,
          winners,
          "loser_slot-taken": kinds["slot-taken"],
          "loser_booking-conflict": kinds["booking-conflict"],
          "loser_refused-db-error": kinds["refused-db-error"],
          loser_unexpected: kinds.unexpected,
          refusedTraceIds: refused.join(","),
        };

        guardViolations.push(...guards.map((g) => `t${trial}: ${g}`));
        pairsByTrial[trial - 1] = pairs.length;
        overlapPairs += pairs.length;

        perTrial.push(record);
        spreads.push(record.dispatchSpreadMs);
        mergeStatusCounts(histogram.statusCounts, record.statusCounts);

        if (!record.ok) throw new Error(record.error);
      } finally {
        for (const uid of winnerUids) await cancelQuietly(uid, cancelled);
        const live = await caseLiveBookings(input.pool, trialPattern).catch(() => []);
        for (const row of live) await cancelQuietly(row.uid, cancelled);
      }
    });

    const failedRecords = failedTrialRecords(trialResults, perTrial);
    for (const failed of failedRecords) {
      guardViolations.push(`t${failed.trial}: ${failed.error ?? "trial failed"}`);
    }
    perTrial.push(...failedRecords);

    histogram.perTrial = perTrial.sort((a, b) => a.trial - b.trial);
    histogram.dispatchSpreadMs = aggregateDispatchSpread(spreads);

    const swept = await sweepAndLeakCheck(input.pool, leakPattern, cancelQuietly);
    leakAccepted = swept.leakAccepted;

    histogram.oracle = {
      hostUserId: input.setup.userId,
      eventTypeId30: input.setup.eventTypeId30,
      eventTypeId60: input.setup.eventTypeId60,
      ...doubleBookSummary(pairsByTrial),
      outcome_both: outcomes.both,
      outcome_60_only: outcomes["60_only"],
      outcome_30_only: outcomes["30_only"],
      outcome_none: outcomes.none,
      "loser_slot-taken": loserTotals["slot-taken"],
      "loser_booking-conflict": loserTotals["booking-conflict"],
      "loser_refused-db-error": loserTotals["refused-db-error"],
      loser_unexpected: loserTotals.unexpected,
      refusedTraceIds: refusedTraceIds.join(","),
      leakAccepted,
    };
    histogram.invariantViolations.push(...cleanupViolations, ...swept.leak);
    guardViolations.push(...cleanupViolations, ...swept.leak);

    const trialsOk = trialResults.every((t) => t.ok);
    histogram.verdict = trialsOk && histogram.invariantViolations.length === 0 ? "pass" : "fail";
  } finally {
    histogram.finishedAt = new Date().toISOString();
    await writeHistogram(histogram);
  }

  return {
    histogram,
    guardViolations,
    overlapPairs,
    doubleBook: doubleBookSummary(pairsByTrial),
  };
}
