// k6-facing side of the spike cases (Phase 4 Task 6 §6.2): the steady -> spike -> steady scenario, the response counters by phase and
// route, and the iteration lines. The pure parts (plan, sizing, classes) live in k6/lib/pure/spike.js.
import exec from "k6/execution";
import { Counter, Gauge } from "k6/metrics";
import { observeResponses } from "./http.js";
import { clockHooks } from "./markers.js";
import { intentLine } from "./pure/knee.js";
import { standardOptions } from "./pure/options.js";
import { buildSpikePlan, classifySpikeResponse, phaseAt, spikeVus } from "./pure/spike.js";

const counters = {
  ok: new Counter("p6_resp_ok"),
  body: new Counter("p6_resp_4xx_body"),
  nobody: new Counter("p6_resp_4xx_nobody"),
  limited: new Counter("p6_resp_429"),
  server: new Counter("p6_resp_5xx"),
  transport: new Counter("p6_resp_transport"),
};
const iterLimited = new Counter("p6_iter_limited");
const started = new Counter("p6_step_started"); // the intents started, as the knee counts them (per-intent reconciliation)
const t0 = new Gauge("p6_spike_t0_ms");

// Per VU, per iteration: whether a 429 or a network error was seen.
let sawLimited = false;
let sawNetworkError = false;

/**
 * Options of a spike script. cfg.plan is buildSpikePlan(cfg); the VU pool is sized from the spike (spikeVus, §3.2). The rates are
 * written over cfg.timeUnitSec (the fractional Documenso and Medusa rates need 10). Thresholds are none: the contract is judged in the
 * stage, and a refusal is an expected result here.
 * @param {any} cfg
 */
export function spikeOptions(cfg) {
  const { plan } = cfg;
  const unit = plan.timeUnitSec;
  const { pre, max } = spikeVus({
    steadyRate: cfg.steadyRate,
    spikeRate: cfg.spikeRate,
    spikeSec: cfg.spikeSec,
    rampSec: cfg.rampSec,
  });
  const scenario = {
    executor: "ramping-arrival-rate",
    startRate: Math.round(plan.startRate * unit),
    timeUnit: `${unit}s`,
    preAllocatedVUs: pre,
    maxVUs: max,
    stages: plan.stages.map((/** @type {any} */ s) => ({
      target: Math.round(s.target * unit),
      duration: s.duration,
    })),
    ...(cfg.exec ? { exec: cfg.exec } : {}),
    ...(cfg.tags ? { tags: cfg.tags } : {}),
  };
  return standardOptions({ scenarios: { spike: scenario }, thresholds: {}, tags: cfg.tags ?? {} });
}

/**
 * Call first in every iteration: tags the VU with its phase, resets the per-iteration flags, returns the intent number.
 * @param {ReturnType<typeof buildSpikePlan>} plan
 */
export function beginSpikeIteration(plan) {
  started.add(1);
  exec.vu.tags.phase = phaseAt(plan, Date.now() - exec.scenario.startTime) ?? "after";
  sawLimited = false;
  sawNetworkError = false;
  return exec.scenario.iterationInTest;
}

/**
 * Call last in every iteration: one outcome line (Task 1 §6.8), and, when a 429 was seen, the limited line of the Documenso rule (§6.5).
 * @param {number} intent
 * @param {boolean} committed
 */
export function endSpikeIteration(intent, committed) {
  console.log(intentLine(intent, committed, sawNetworkError, false));
  if (sawLimited) {
    iterLimited.add(1);
    console.log(JSON.stringify({ intent, limited: true }));
  }
}

/**
 * The route family of a response: "/api/trpc", "/api/v2", "/api/v1", ... (never the full URL, which can carry a token).
 * @param {any} res
 */
function routeOf(res) {
  try {
    return new URL(res.url).pathname.split("/").slice(0, 3).join("/");
  } catch {
    return "unknown";
  }
}

/** @param {any} res */
function hasJsonBody(res) {
  try {
    JSON.parse(res.body);
    return true;
  } catch {
    return false;
  }
}

/**
 * Once in the init context: every response made through request() or a retry attempt is counted by class, phase and route.
 */
export function observeSpikeResponses() {
  observeResponses((/** @type {any} */ res) => {
    const phase = String(exec.vu.tags.phase ?? "unknown");
    const cls = classifySpikeResponse(res.status, hasJsonBody(res));
    if (res.status === 0) sawNetworkError = true;
    if (cls === "limited") {
      sawLimited = true;
      counters.limited.add(1, {
        phase,
        route: routeOf(res),
        body: hasJsonBody(res) ? "yes" : "no",
      });
    } else if (cls === "ok") counters.ok.add(1, { phase });
    else if (cls === "refused_with_body") counters.body.add(1, { phase });
    else if (cls === "refused_no_body") counters.nobody.add(1, { phase });
    else if (cls === "server_error") counters.server.add(1, { phase });
    else if (cls === "transport") counters.transport.add(1, { phase });
  });
}

/** setup() and teardown(): the Phase 3 clock markers plus the spike origin (p6_spike_t0_ms). @param {string | undefined} markerUrl */
export function spikeHooks(markerUrl) {
  const clock = clockHooks(markerUrl);
  return {
    setup() {
      clock.setup();
      t0.add(Date.now());
    },
    teardown: clock.teardown,
  };
}
