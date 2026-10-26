// Pure spike plan, sizing and response classes (Phase 4 Task 6). No k6 import: the scenario objects are plain data.

/**
 * Stages for steady -> spike -> quiet -> steady, rates per second. The quiet phase (quietSec, 0 for none) sends nothing, so a
 * fixed limiter window has reset before the watch phase starts. The k6 side writes fractional rates over timeUnitSec (Task 5).
 * @param {{ steadyRate: number, spikeRate: number, steadySec: number, spikeSec: number, rampSec: number, watchSec: number, quietSec?: number, timeUnitSec?: number }} p
 * @returns {{ stages: Array<{ target: number, duration: string }>, startRate: number, timeUnitSec: number, rampSec: number, marks: { steadyEnd: number, spikeStart: number, spikeEnd: number, quietEnd: number, end: number } }}
 */
export function buildSpikePlan({
  steadyRate,
  spikeRate,
  steadySec,
  spikeSec,
  rampSec,
  watchSec,
  quietSec = 0,
  timeUnitSec = 1,
}) {
  for (const [name, v] of Object.entries({ steadySec, spikeSec, rampSec, watchSec })) {
    if (!(v > 0)) throw new Error(`spike plan: ${name} must be above 0 (got ${v})`);
  }
  if (!(quietSec >= 0)) throw new Error(`spike plan: quietSec must be 0 or more (got ${quietSec})`);
  if (quietSec > 0 && !(watchSec >= 2))
    throw new Error(`spike plan: watchSec must be 2 or more after a quiet phase (got ${watchSec})`);
  if (!(steadyRate > 0) || !(spikeRate > steadyRate))
    throw new Error(
      `spike plan: need 0 < steadyRate < spikeRate (got ${steadyRate} and ${spikeRate})`,
    );
  const spikeStart = steadySec + rampSec;
  const spikeEnd = spikeStart + spikeSec;
  // k6 ramps linearly between stage targets, so each change to zero or back to steadyRate takes 1 s, then holds.
  const quietEnd = spikeEnd + rampSec + (quietSec > 0 ? 1 + quietSec : 0);
  const end = quietEnd + watchSec;
  return {
    stages: [
      { target: steadyRate, duration: `${steadySec}s` },
      { target: spikeRate, duration: `${rampSec}s` },
      { target: spikeRate, duration: `${spikeSec}s` },
      { target: steadyRate, duration: `${rampSec}s` },
      ...(quietSec > 0
        ? [
            { target: 0, duration: "1s" },
            { target: 0, duration: `${quietSec}s` },
            { target: steadyRate, duration: "1s" },
            { target: steadyRate, duration: `${watchSec - 1}s` },
          ]
        : [{ target: steadyRate, duration: `${watchSec}s` }]),
    ],
    startRate: steadyRate,
    timeUnitSec,
    rampSec,
    marks: { steadyEnd: steadySec, spikeStart, spikeEnd, quietEnd, end },
  };
}

/**
 * "steady" | "ramp-up" | "spike" | "ramp-down" | "quiet" | "recovery" at an elapsed time; undefined after the plan ends.
 * @param {ReturnType<typeof buildSpikePlan>} plan
 * @param {number} elapsedMs
 * @returns {"steady" | "ramp-up" | "spike" | "ramp-down" | "quiet" | "recovery" | undefined}
 */
export function phaseAt(plan, elapsedMs) {
  const t = elapsedMs / 1000;
  const m = plan.marks;
  if (t < m.steadyEnd) return "steady";
  if (t < m.spikeStart) return "ramp-up";
  if (t < m.spikeEnd) return "spike";
  if (t < m.spikeEnd + plan.rampSec) return "ramp-down";
  if (t < m.quietEnd) return "quiet";
  if (t < m.end) return "recovery";
  return undefined;
}

/**
 * The VU pool for every arrival of the spike: pre = ceil((spikeRate x (spikeSec + 2 x rampSec) + steadyRate x 5) x 1.1), max = ceil(pre x 1.3).
 * The two ramps are both counted (up and down), which gives the pinned defaults 354 and 461 (Cal), 59 and 77 (Medusa), 24 and 32 (Documenso).
 * @param {{ steadyRate: number, spikeRate: number, spikeSec: number, rampSec: number }} p
 * @returns {{ pre: number, max: number }}
 */
export function spikeVus({ steadyRate, spikeRate, spikeSec, rampSec }) {
  const pre = Math.ceil((spikeRate * (spikeSec + 2 * rampSec) + steadyRate * 5) * 1.1);
  return { pre, max: Math.ceil(pre * 1.3) };
}

/**
 * A 429 is "limited" with or without a body. Other 4xx are refusals, with a body or without one. Status 0 is a transport error.
 * @param {number} status
 * @param {boolean} bodyIsJson
 * @returns {"ok" | "refused_with_body" | "refused_no_body" | "limited" | "server_error" | "transport" | "other"}
 */
export function classifySpikeResponse(status, bodyIsJson) {
  if (status === 0) return "transport";
  if (status === 429) return "limited";
  if (status >= 200 && status < 300) return "ok";
  if (status >= 500) return "server_error";
  if (status >= 400) return bodyIsJson ? "refused_with_body" : "refused_no_body";
  return "other";
}

/**
 * The wait, in ms, that starts the scenario so its spike begins on a wall-clock boundary (the limiter's fixed one-minute windows).
 * spikeStartOffsetMs is the time from the scenario start to the spike (steady + ramp). Always in [0, boundaryMs): a start exactly on
 * the boundary waits 0 ms.
 * @param {number} nowMs
 * @param {number} spikeStartOffsetMs
 * @param {number} [boundaryMs]
 * @returns {number}
 */
export function alignDelayMs(nowMs, spikeStartOffsetMs, boundaryMs = 60000) {
  return (boundaryMs - ((nowMs + spikeStartOffsetMs) % boundaryMs)) % boundaryMs;
}

/**
 * True when [startMs, endMs) lies inside one window of windowMs.
 * @param {number} startMs
 * @param {number} endMs
 * @param {number} [windowMs]
 * @returns {boolean}
 */
export function inOneWindow(startMs, endMs, windowMs = 60000) {
  return Math.floor(startMs / windowMs) === Math.floor((endMs - 1) / windowMs);
}

/**
 * The distance, in ms, from a time to the nearest wall-clock boundary (a multiple of boundaryMs).
 * @param {number} ms
 * @param {number} [boundaryMs]
 * @returns {number}
 */
export function distanceToBoundaryMs(ms, boundaryMs = 60000) {
  const r = ms % boundaryMs;
  return Math.min(r, boundaryMs - r);
}
