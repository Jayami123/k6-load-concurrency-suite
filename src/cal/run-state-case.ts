import type pg from "pg";
import { fireTogether } from "../races/fire-together.ts";
import { calBaseUrlFromEnv } from "../races/env.ts";
import { createHistogram, writeHistogram } from "../races/histogram.ts";
import {
  attemptTag,
  createRerunRunner,
  spreadPolicyFromEnv,
  sumOracle,
  validAttempts,
} from "../races/rerun-on-spread.ts";
import { recordTrial } from "../races/trial-record.ts";
import { runTrials } from "../races/run-trials.ts";
import type { RaceAttemptResult, RaceHistogram } from "../races/types.ts";
import {
  caseLeakPattern,
  casePrefix,
  cleanupFailure,
  likeLiteralPrefix,
} from "../medusa/payloads.ts";
import { cancelBooking, createBooking, type createSlotAllocator } from "./api.ts";
import { CAL_EVENT_SLUG, attendeeEmail, bookingBody } from "./payloads.ts";
import { caseLiveBookings, leakCheck } from "./oracle.ts";
import {
  readBookingByEmail,
  readBookingStatus,
  readCaseAccepted,
  readLinkState,
} from "./state-oracle.ts";
import {
  checkConfirmCancel,
  checkConfirmConfirm,
  checkLinkCap,
  checkSignedDeliveries,
  checkStatusNotNull,
} from "./state-invariants.ts";
import type { WebhookDelivery } from "../receivers/webhook-receiver.ts";
import { clearPrivateLinks, privateLinkId, setPrivateLinks } from "./private-link.ts";

export type StateCaseResult = {
  histogram: RaceHistogram;
  /** SUSPECTED PRODUCT BUG lines of every attempt, invalid and warm-up included (D3). Annotated by the spec. */
  suspected: string[];
  /** The owner-labelled lines among `suspected`. Asserted only by the case known-bug test (test.fail), never by the guards. */
  labelled: string[];
};

/** Keeps the lines whose tag the owner labelled. The guards verdict never reads them; the known-bug test asserts them. */
export function labelledLines(suspected: readonly string[], labelled: readonly string[]): string[] {
  return suspected.filter((line) => labelled.some((tag) => line.includes(`(${tag})`)));
}

/** N parallel bookings through one private link per attempt, on distinct free slots. `cap` is the link's maxUsageCount. */
export async function runLinkBurstCase(input: {
  pool: pg.Pool;
  setup: { userId: number; eventTypeId: number };
  slots: ReturnType<typeof createSlotAllocator>;
  cookie: string;
  runPrefix: string;
  caseId: string;
  title: string;
  n: number;
  cap: number;
  trials: number;
  labelled: readonly string[];
}): Promise<StateCaseResult> {
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

  const runner = createRerunRunner(spreadPolicyFromEnv(), input.trials);
  const suspected: string[] = [];
  const cleanupViolations: string[] = [];

  try {
    const runAttempt = async (trial: number, attempt: number): Promise<RaceAttemptResult> => {
      const tag = attemptTag(trial, attempt);
      const attemptPrefix = `${dataPrefix}-${tag}`;
      // Unique per attempt: the link column is unique, and a rerun must not reuse the previous link.
      const link = privateLinkId(dataPrefix, trial * 100 + attempt);
      const attemptLike = likeLiteralPrefix(`${attemptPrefix}-`);
      const cleanupCancelled = new Set<string>();

      try {
        await setPrivateLinks(base, input.cookie, input.setup.eventTypeId, [
          { link, maxUsageCount: input.cap },
        ]);

        const slots: Array<{ start: string; end: string }> = [];
        for (let i = 0; i < input.n; i++) slots.push(await input.slots.next());

        const fired = await fireTogether(
          input.n,
          (i) =>
            createBooking({
              ...bookingBody({
                start: slots[i]!.start,
                end: slots[i]!.end,
                email: attendeeEmail(attemptPrefix, `c${String(i).padStart(2, "0")}`),
                name: `p6 link ${String(i).padStart(2, "0")}`,
                eventTypeId: input.setup.eventTypeId,
                eventTypeSlug: CAL_EVENT_SLUG,
              }),
              hasHashedBookingLink: true,
              hashedLink: link,
            }),
          {
            warm: async () => {
              const res = await fetch(`${base}/api/csrf`);
              await res.text();
            },
          },
        );

        const accepted = await readCaseAccepted(input.pool, attemptLike);
        const state = await readLinkState(input.pool, input.setup.eventTypeId, link);
        const statuses = fired.requests.map((r) => r.status);
        const findings = checkLinkCap({
          cap: input.cap,
          accepted,
          usageCount: state.usageCount,
          statuses,
        });
        suspected.push(...findings.suspected.map((line) => `${line} [${tag}]`));

        const record = recordTrial(trial, fired, () => {
          if (findings.testGuards.length > 0) throw new Error(findings.testGuards.join("; "));
        });
        record.oracle = {
          cap: input.cap,
          accepted,
          usageCount: state.usageCount,
          maxUsageCount: state.maxUsageCount,
        };
        return record;
      } finally {
        // Cancel what this attempt accepted, then drop its link so the next attempt starts clean.
        for (const row of await caseLiveBookings(input.pool, attemptLike).catch(() => [])) {
          if (cleanupCancelled.has(row.uid)) continue;
          cleanupCancelled.add(row.uid);
          try {
            await cancelBooking(row.uid);
          } catch (err) {
            cleanupViolations.push(cleanupFailure("booking", row.uid, err));
          }
        }
        try {
          await clearPrivateLinks(base, input.cookie, input.setup.eventTypeId);
        } catch (err) {
          cleanupViolations.push(cleanupFailure("link", link, err));
        }
      }
    };

    await runner.warmup((attempt) => runAttempt(0, attempt));
    const trialResults = await runTrials(input.trials, (trial) =>
      runner.runTrial(trial, (attempt) => runAttempt(trial, attempt)),
    );
    runner.applyTo(histogram);
    const valid = validAttempts(runner.attempts);

    // Sweep: cancel anything of this case still live, then the leak check wants none.
    for (const row of await caseLiveBookings(input.pool, leakPattern)) {
      try {
        await cancelBooking(row.uid);
      } catch (err) {
        cleanupViolations.push(cleanupFailure("booking", row.uid, err));
      }
    }
    const leak = await leakCheck(input.pool, leakPattern);

    histogram.oracle = {
      hostUserId: input.setup.userId,
      eventTypeId: input.setup.eventTypeId,
      cap: input.cap,
      acceptedTotal: sumOracle(valid, "accepted"), // rates: valid attempts only (D4)
      suspectedLines: suspected.length, // every attempt, including invalid ones
      labelledLines: labelledLines(suspected, input.labelled).length,
    };
    histogram.invariantViolations.push(...cleanupViolations, ...leak);

    const trialsOk = trialResults.every((t) => t.ok);
    histogram.verdict = trialsOk && histogram.invariantViolations.length === 0 ? "pass" : "fail";
  } finally {
    histogram.finishedAt = new Date().toISOString();
    await writeHistogram(histogram);
  }

  return { histogram, suspected, labelled: labelledLines(suspected, input.labelled) };
}

/** Waits until no new delivery arrived for `quietMs`, or `maxMs` passed. Returns how many deliveries the receiver holds. */
export async function waitQuiet(
  receiver: { deliveries: WebhookDelivery[] },
  quietMs: number,
  maxMs: number,
): Promise<number> {
  const start = Date.now();
  let seen = receiver.deliveries.length;
  let lastChange = start;
  while (Date.now() - lastChange < quietMs && Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 100));
    if (receiver.deliveries.length !== seen) {
      seen = receiver.deliveries.length;
      lastChange = Date.now();
    }
  }
  return receiver.deliveries.length;
}

/** Subscribes the receiver to the booking triggers of one event type. Returns the subscription id. */
export async function subscribeWebhook(
  baseUrl: string,
  cookie: string,
  eventTypeId: number,
  subscriberUrl: string,
  secret: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/trpc/webhook/create?batch=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      0: {
        json: {
          eventTypeId,
          subscriberUrl,
          eventTriggers: ["BOOKING_CREATED", "BOOKING_CANCELLED", "BOOKING_REQUESTED"],
          active: true,
          payloadTemplate: null,
          secret,
        },
      },
    }),
  });
  const text = await res.text();
  const id = (JSON.parse(text) as Array<{ result?: { data?: { json?: { id?: string } } } }>)[0]
    ?.result?.data?.json?.id;
  if (res.status !== 200 || !id)
    throw new Error(`TEST BUG: webhook create answered HTTP ${res.status}`);
  return id;
}

export async function unsubscribeWebhook(
  baseUrl: string,
  cookie: string,
  id: string,
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/trpc/webhook/delete?batch=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ 0: { json: { id } } }),
  });
  await res.text();
  if (res.status !== 200) throw new Error(`TEST BUG: webhook delete answered HTTP ${res.status}`);
}

/** One PENDING booking per attempt, then confirm ‖ cancel (`confirm-cancel`) or confirm ‖ confirm (`confirm-confirm`). */
export async function runPendingRaceCase(input: {
  pool: pg.Pool;
  setup: { eventTypeId: number; length: number; username: string; userId: number };
  slots: ReturnType<typeof createSlotAllocator>;
  receiver: { deliveries: WebhookDelivery[] };
  cookie: string;
  runPrefix: string;
  caseId: string;
  title: string;
  mode: "confirm-cancel" | "confirm-confirm";
  trials: number;
  labelled: readonly string[];
}): Promise<StateCaseResult> {
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
  const runner = createRerunRunner(spreadPolicyFromEnv(), input.trials);
  const suspected: string[] = [];
  const cleanupViolations: string[] = [];

  const confirm = async (bookingId: number) => {
    const res = await fetch(`${base}/api/trpc/bookings/confirm?batch=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: input.cookie },
      body: JSON.stringify({ 0: { json: { bookingId, confirmed: true, emailsEnabled: false } } }),
    });
    return { status: res.status, body: await res.text() };
  };
  // cancelBooking throws "cancel <uid> HTTP <status>"; the status is read back from that message.
  const cancelAsRequest = async (uid: string) => {
    try {
      await cancelBooking(uid);
      return { status: 200, body: "" };
    } catch (err) {
      const status = Number(/HTTP (\d+)/.exec(err instanceof Error ? err.message : "")?.[1]);
      if (Number.isNaN(status)) throw err; // no HTTP status: fireTogether records null
      return { status, body: "" };
    }
  };

  try {
    const runAttempt = async (trial: number, attempt: number): Promise<RaceAttemptResult> => {
      const tag = attemptTag(trial, attempt);
      const attemptPrefix = `${dataPrefix}-${tag}`;
      const attemptLike = likeLiteralPrefix(`${attemptPrefix}-`);
      const email = attendeeEmail(attemptPrefix, "c00");
      let uid: string | null = null;
      try {
        const slot = await input.slots.next();
        const created = await createBooking({
          ...bookingBody({
            start: slot.start,
            end: slot.end,
            email,
            name: "p6 pending",
            eventTypeId: input.setup.eventTypeId,
            eventTypeSlug: "tennis-class",
          }),
          user: input.setup.username,
        });
        if (created.status !== 200)
          throw new Error(`TEST BUG: pending create answered HTTP ${created.status}`);
        const booking = await readBookingByEmail(input.pool, email);
        uid = booking.uid;
        if ((await readBookingStatus(input.pool, booking.id)) !== "pending") {
          throw new Error("TEST BUG: new booking is not pending");
        }

        const before = input.receiver.deliveries.length;
        const fired = await fireTogether(2, (i) => {
          if (input.mode === "confirm-cancel") {
            return i === 0 ? confirm(booking.id) : cancelAsRequest(booking.uid);
          }
          return confirm(booking.id);
        });
        await waitQuiet(input.receiver, 1500, 8000);

        const window = input.receiver.deliveries.slice(before);
        const own = window.filter(
          (d) => (d.body as { payload?: { uid?: unknown } } | null)?.payload?.uid === booking.uid,
        );
        const triggerOf = (d: WebhookDelivery) =>
          (d.body as { triggerEvent?: string } | null)?.triggerEvent;
        const createdCount = own.filter((d) => triggerOf(d) === "BOOKING_CREATED").length;
        const cancelledCount = own.filter((d) => triggerOf(d) === "BOOKING_CANCELLED").length;
        const finalStatus = await readBookingStatus(input.pool, booking.id);
        const statuses = fired.requests.map((r) => r.status);

        const findings =
          input.mode === "confirm-cancel"
            ? checkConfirmCancel({ finalStatus, createdCount, cancelledCount })
            : checkConfirmConfirm({ finalStatus, createdCount, statuses });
        const guards = [
          ...(input.mode === "confirm-cancel" ? checkStatusNotNull(statuses) : findings.testGuards),
          ...checkSignedDeliveries(window),
        ];
        suspected.push(...findings.suspected.map((line) => `${line} [${tag}]`));

        const record = recordTrial(trial, fired, () => {
          if (guards.length > 0) throw new Error(guards.join("; "));
        });
        record.oracle = { finalStatus, createdCount, cancelledCount, statuses: statuses.join("/") };
        return record;
      } finally {
        if (uid) {
          try {
            const live = await caseLiveBookings(input.pool, attemptLike);
            for (const row of live) await cancelBooking(row.uid);
          } catch (err) {
            cleanupViolations.push(cleanupFailure("booking", uid, err));
          }
        }
      }
    };

    await runner.warmup((attempt) => runAttempt(0, attempt));
    const trialResults = await runTrials(input.trials, (trial) =>
      runner.runTrial(trial, (attempt) => runAttempt(trial, attempt)),
    );
    runner.applyTo(histogram);
    const valid = validAttempts(runner.attempts);

    for (const row of await caseLiveBookings(input.pool, leakPattern)) {
      try {
        await cancelBooking(row.uid);
      } catch (err) {
        cleanupViolations.push(cleanupFailure("booking", row.uid, err));
      }
    }
    const leak = await leakCheck(input.pool, leakPattern);

    histogram.oracle = {
      hostUserId: input.setup.userId,
      eventTypeId: input.setup.eventTypeId,
      mode: input.mode,
      emailObservable: false, // D9: no mail catcher in the harness; the email half is a recorded gap
      acceptedTotal: sumOracle(valid, "createdCount"),
      suspectedLines: suspected.length,
      labelledLines: labelledLines(suspected, input.labelled).length,
    };
    histogram.invariantViolations.push(...cleanupViolations, ...leak);
    histogram.verdict =
      trialResults.every((t) => t.ok) && histogram.invariantViolations.length === 0
        ? "pass"
        : "fail";
  } finally {
    histogram.finishedAt = new Date().toISOString();
    await writeHistogram(histogram);
  }

  return { histogram, suspected, labelled: labelledLines(suspected, input.labelled) };
}
