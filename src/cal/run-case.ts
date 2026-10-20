import type pg from "pg";
import { fireTogether } from "../races/fire-together.ts";
import { runTrials } from "../races/run-trials.ts";
import {
  aggregateDispatchSpread,
  createHistogram,
  mergeStatusCounts,
  writeHistogram,
} from "../races/histogram.ts";
import { recordTrial } from "../races/trial-record.ts";
import { calBaseUrlFromEnv, raceMaxSpreadMsFromEnv } from "../races/env.ts";
import type { RaceHistogram, RaceTrialResult } from "../races/types.ts";
import { caseLeakPattern, casePrefix, cleanupFailure } from "../medusa/payloads.ts";
import { cancelBooking, createBooking, type createSlotAllocator } from "./api.ts";
import {
  checkIdenticalSlotInvariants,
  classifyLoser,
  type LoserKind,
  type ParsedResponse,
} from "./invariants.ts";
import { caseLiveBookings, leakCheck, readSlotAccepted } from "./oracle.ts";
import { attendeeEmail, bookingBody, parseBookingResponse, timeSpellings } from "./payloads.ts";

export type IdenticalSlotMode = "distinct" | "sameAttendee" | "spellings";

const LOSER_KINDS: LoserKind[] = [
  "slot-taken",
  "booking-conflict",
  "db-unique-redacted",
  "unexpected",
];

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

  const cancelQuietly = async (uid: string, cancelled: Set<string>) => {
    if (cancelled.has(uid)) return;
    cancelled.add(uid);
    try {
      await cancelBooking(uid);
    } catch (err) {
      cleanupViolations.push(cleanupFailure("booking", uid, err));
    }
  };

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

    const recorded = new Set(perTrial.map((t) => t.trial));
    for (const failed of trialResults.filter((t) => !t.ok && !recorded.has(t.trial))) {
      perTrial.push({
        trial: failed.trial,
        ok: false,
        statuses: [],
        statusCounts: {},
        dispatchSpreadMs: 0,
        oracle: {},
        invariantViolations: failed.error ? [failed.error] : [],
        error: failed.error,
      });
    }

    histogram.perTrial = perTrial.sort((a, b) => a.trial - b.trial);
    histogram.dispatchSpreadMs = aggregateDispatchSpread(spreads);

    // Sweep: cancel anything of this case still holding a slot, then the leak check wants 0.
    const sweepCancelled = new Set<string>();
    for (const row of await caseLiveBookings(input.pool, leakPattern)) {
      await cancelQuietly(row.uid, sweepCancelled);
    }
    const leak = await leakCheck(input.pool, leakPattern);
    leakAccepted = (await caseLiveBookings(input.pool, leakPattern)).length;

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
