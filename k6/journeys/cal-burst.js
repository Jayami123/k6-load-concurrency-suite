// The burst and the stale probe of the Cal invariants (plan Phase 4b task 8 §6.2, §6.3). Every attempt and every poll is one line on
// stdout (P6_BURST / P6_POLL, JSON): the runner's verdict stage reads them from the k6 log. No credential is logged.
import { request } from "../lib/http.js";
import { acceptedCounter } from "./cal-book.js";
import { attendeeEmail } from "../lib/pure/prefix.js";
import { scheduleWindow } from "../lib/pure/cal-slots.js";

const HALF_HOUR_MS = 30 * 60000;

/**
 * One booking attempt on the fixed slot `cfg.burstSlot` (ISO start). Logs P6_BURST with the status, the body kind and the request start.
 * @param {{ baseUrl: string, eventTypeId: number, eventTypeSlug: string, host: string, prefix: string, burstSlot: string }} cfg
 * @param {string} label the attempt's label (its intent line: "<prefix>-<label> burst")
 * @returns {{ status: number, bodyKind: string }}
 */
export function bookTarget(cfg, label) {
  const start = Date.now();
  const body = {
    responses: {
      name: "P6 Burst",
      email: attendeeEmail(cfg.prefix, label),
      guests: [],
      location: { value: "integrations:daily", optionValue: "" },
    },
    user: cfg.host,
    start: cfg.burstSlot,
    end: new Date(Date.parse(cfg.burstSlot) + HALF_HOUR_MS).toISOString(),
    eventTypeId: cfg.eventTypeId,
    eventTypeSlug: cfg.eventTypeSlug,
    timeZone: "UTC",
    language: "en",
    metadata: {},
    hasHashedBookingLink: false,
  };
  const r = request("POST", `${cfg.baseUrl}/api/book/event`, "POST burst book", body, {
    headers: { "Content-Type": "application/json" },
  });
  let bodyKind = "other";
  if (r.status === 200) bodyKind = r.json("status") === "ACCEPTED" ? "accepted" : "slot-taken";
  else if (r.status === 409) bodyKind = "conflict-409";
  else if (r.status === 400) bodyKind = "redacted-400";
  const uid = r.status === 200 ? r.json("uid") : undefined;
  if (bodyKind === "accepted") acceptedCounter.add(1); // the steady audit counts every ACCEPTED the client saw
  console.log(
    `P6_BURST ${JSON.stringify({ intent: `${cfg.prefix}-${label} burst`, status: r.status, bodyKind, requestStartMs: start, uid })}`,
  );
  return { status: r.status, bodyKind };
}

/**
 * Whether the slot S is offered by getSchedule for its own day window now. Null when the request failed (a non-200 or a body without
 * slots), so the poll is recorded as failed, never as "not offered".
 * @param {{ baseUrl: string, eventTypeId: number, eventTypeSlug: string, host: string }} cfg
 * @param {string} slot ISO start
 * @returns {boolean | null}
 */
export function offeredNow(cfg, slot) {
  const w = scheduleWindow(slot, 28);
  const input = {
    json: {
      eventTypeId: cfg.eventTypeId,
      startTime: w.startTime,
      endTime: w.endTime,
      timeZone: "UTC",
      isTeamEvent: false,
      usernameList: [cfg.host],
      eventTypeSlug: cfg.eventTypeSlug,
      orgSlug: null,
    },
  };
  const r = request(
    "GET",
    `${cfg.baseUrl}/api/trpc/slots/getSchedule?input=${encodeURIComponent(JSON.stringify(input))}`,
    "GET getSchedule",
  );
  if (r.status !== 200) return null;
  const slots = r.json("result.data.json.slots");
  if (slots === undefined || slots === null) return null;
  return Object.values(slots)
    .flat()
    .some((s) => Date.parse(s.time) === Date.parse(slot));
}
