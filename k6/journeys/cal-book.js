import { check } from "k6";
import exec from "k6/execution";
import { Counter } from "k6/metrics";
import { runJourney } from "../lib/pure/journey.js";
import { attendeeEmail } from "../lib/pure/prefix.js";
import { slotFor, scheduleWindow } from "../lib/pure/cal-slots.js";
import { recycleSlotIndex } from "../lib/pure/recycle.js";
import { request, retried, retryCounters } from "../lib/http.js";
export const acceptedCounter = new Counter("p6_bookings_accepted");
export const cancelsOkCounter = new Counter("p6_cancels_ok");
export const cancelsFailedCounter = new Counter("p6_cancels_failed");
const CSRF_COOKIE = "calcom.csrf_token";
const DAY = 86400000;

/**
 * cfg.recycle (plan Phase 4b task 7 §6.3): cancels the booking of this iteration with the CSRF flow of src/cal/api.ts
 * cancelBooking. Returns true on a 200. Never logs the token.
 * @param {{ baseUrl: string }} cfg
 * @param {string | undefined} uid the booking uid from the book response
 * @returns {boolean}
 */
function cancelRecycled(cfg, uid) {
  const csrf = request("GET", `${cfg.baseUrl}/api/csrf`, "GET csrf");
  const token = csrf.status === 200 ? csrf.json("csrfToken") : undefined;
  const cookie = csrf.cookies[CSRF_COOKIE];
  if (!token || !cookie || uid === undefined) {
    cancelsFailedCounter.add(1);
    return false;
  }
  const res = request(
    "POST",
    `${cfg.baseUrl}/api/cancel`,
    "POST cancel",
    {
      uid,
      cancellationReason: "p6 soak recycle",
      cancelledBy: "p6-qa@example.com",
      csrfToken: token,
    },
    {
      headers: { "Content-Type": "application/json", Cookie: `${CSRF_COOKIE}=${cookie[0].value}` },
    },
  );
  const ok = res.status === 200;
  (ok ? cancelsOkCounter : cancelsFailedCounter).add(1);
  return ok;
}

/**
 * cfg.links (case -009): one private link per intent; the booking of intent n carries links[n]. opts.retryPlan (retry cases):
 * the booking request is sent through the plan (plan task 10 §6.2); without it the journey is unchanged.
 * cfg.slotStarts (knee, plan task 2 §6.2): iteration n books slotStarts[n], and its getSchedule covers a 28-day window from that day.
 * @param {{ baseUrl: string, eventTypeId: number, eventTypeSlug: string, host: string, prefix: string, windowDays: number, links?: string[], slotStarts?: string[], recycle?: boolean }} cfg
 * @param {{ retryPlan?: Array<{ timeoutMs: number, delayMs: number, parallel: number }>, onCommit?: () => void }} [opts]
 */
export function runCalBook(cfg, opts = {}) {
  const n = exec.scenario.iterationInTest; // global, unique across VUs: the slot index
  if (opts.retryPlan) retryCounters.intents.add(1);
  const from = Math.floor(Date.now() / DAY) * DAY + 2 * DAY; // same rule as createSlotAllocator in src/cal/api.ts
  const input = {
    json: {
      eventTypeId: cfg.eventTypeId,
      startTime: new Date(from).toISOString(),
      endTime: new Date(from + cfg.windowDays * DAY).toISOString(),
      timeZone: "UTC",
      isTeamEvent: false,
      usernameList: [cfg.host],
      eventTypeSlug: cfg.eventTypeSlug,
      orgSlug: null,
    },
  };
  // Fixed slot (knee): the target is ours alone, so the list need not shift under concurrency. The target must be offered; otherwise
  // the setup list is stale (TEST BUG).
  const fixedSchedule = () => {
    const slots = cfg.slotStarts ?? [];
    // recycle: the pool is reused, so the index wraps at its size (plan Phase 4b task 7 §6.3)
    const target =
      cfg.recycle === true ? slots[recycleSlotIndex(n, slots.length)] : slotFor(slots, n);
    if (target === undefined) return { ok: false }; // supply exhausted: TEST BUG
    const w = scheduleWindow(target, 28);
    const fixed = { json: { ...input.json, startTime: w.startTime, endTime: w.endTime } };
    const r = request(
      "GET",
      `${cfg.baseUrl}/api/trpc/slots/getSchedule?input=${encodeURIComponent(JSON.stringify(fixed))}`,
      "GET getSchedule",
    );
    if (r.status !== 200) return { ok: false };
    const offered = Object.values(
      /** @type {Record<string, Array<{ time: string }>>} */ (r.json("result.data.json.slots")),
    ).flat();
    return {
      ok: offered.some((s) => Date.parse(s.time) === Date.parse(target)),
      data: { start: target },
    };
  };
  const steps = [
    {
      name: "getSchedule",
      run: () => {
        if (cfg.slotStarts !== undefined) return fixedSchedule();
        const r = request(
          "GET",
          `${cfg.baseUrl}/api/trpc/slots/getSchedule?input=${encodeURIComponent(JSON.stringify(input))}`,
          "GET getSchedule",
        );
        if (r.status !== 200) return { ok: false };
        const slots = Object.values(
          /** @type {Record<string, Array<{ time: string }>>} */ (r.json("result.data.json.slots")),
        )
          .flat()
          .map((s) => s.time)
          .sort();
        return { ok: slots.length > n, data: { start: slots[n] } };
      },
    }, // fewer slots than iterations = TEST BUG (supply)
    {
      name: "book",
      run: (/** @type {Record<string, unknown>} */ s) => {
        const start = /** @type {string} */ (s.start);
        const end = new Date(Date.parse(start) + 30 * 60000).toISOString();
        const link = cfg.links ? cfg.links[n] : undefined;
        if (cfg.links !== undefined && link === undefined) return { ok: false }; // more iterations than links: TEST BUG
        const body = {
          responses: {
            name: "P6 Load",
            email: attendeeEmail(cfg.prefix, `i${n}`),
            guests: [],
            location: { value: "integrations:daily", optionValue: "" },
          },
          user: cfg.host,
          start,
          end,
          eventTypeId: cfg.eventTypeId,
          eventTypeSlug: cfg.eventTypeSlug,
          timeZone: "UTC",
          language: "en",
          metadata: {},
          hasHashedBookingLink: link !== undefined,
          hashedLink: link,
        }; // = bookingBody() of src/cal/payloads.ts (hashedLink is dropped from the JSON when there is no link)
        const url = `${cfg.baseUrl}/api/book/event`;
        const headers = { "Content-Type": "application/json" };
        if (opts.retryPlan) {
          const out = retried(opts.retryPlan, "POST", url, "POST book", body, { headers });
          // a 200 means the client saw the booking; a 409 or a redacted 400 is a definite answer too (counted, not a failure)
          const accepted = out.answers.some((r) => r.json("status") === "ACCEPTED");
          if (accepted) {
            acceptedCounter.add(1);
            opts.onCommit?.();
            retryCounters.intentsOk.add(1);
          }
          return { ok: out.definite };
        }
        const r = request("POST", url, "POST book", body, { headers });
        const ok = r.status === 200 && r.json("status") === "ACCEPTED";
        if (ok) {
          acceptedCounter.add(1);
          opts.onCommit?.();
        }
        // A failed cancel makes this iteration a FAIL in its intent line (plan Phase 4b task 7 §6.3).
        if (ok && cfg.recycle === true) return { ok: cancelRecycled(cfg, r.json("uid")) };
        return { ok };
      },
    },
  ];
  return runJourney({
    steps,
    deps: { check: (nme, ok) => check(null, { [nme]: () => ok }), sleep: () => {}, now: Date.now },
  });
}
