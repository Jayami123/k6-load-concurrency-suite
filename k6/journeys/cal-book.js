import { check } from "k6";
import exec from "k6/execution";
import { Counter } from "k6/metrics";
import { runJourney } from "../lib/pure/journey.js";
import { attendeeEmail } from "../lib/pure/prefix.js";
import { request } from "../lib/http.js";
export const acceptedCounter = new Counter("p6_bookings_accepted");
const DAY = 86400000;

/**
 * @param {{ baseUrl: string, eventTypeId: number, eventTypeSlug: string, host: string, prefix: string, windowDays: number }} cfg
 */
export function runCalBook(cfg) {
  const n = exec.scenario.iterationInTest; // global, unique across VUs: the slot index
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
  const steps = [
    {
      name: "getSchedule",
      run: () => {
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
          hasHashedBookingLink: false,
        }; // = bookingBody() of src/cal/payloads.ts
        const r = request("POST", `${cfg.baseUrl}/api/book/event`, "POST book", body, {
          headers: { "Content-Type": "application/json" },
        });
        const ok = r.status === 200 && r.json("status") === "ACCEPTED";
        if (ok) acceptedCounter.add(1);
        return { ok };
      },
    },
  ];
  return runJourney({
    steps,
    deps: { check: (nme, ok) => check(null, { [nme]: () => ok }), sleep: () => {}, now: Date.now },
  });
}
