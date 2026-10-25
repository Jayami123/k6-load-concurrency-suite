// Pure spike plan, sizing and response classes (Phase 4 Task 6). No k6 import: the scenario objects are plain data.

/**
 * Stages for steady -> spike -> steady, rates per second. The k6 side writes fractional rates over timeUnitSec (Task 5).
 * @param {{ steadyRate: number, spikeRate: number, steadySec: number, spikeSec: number, rampSec: number, watchSec: number, timeUnitSec?: number }} p
 * @returns {{ stages: Array<{ target: number, duration: string }>, startRate: number, timeUnitSec: number, rampSec: number, marks: { steadyEnd: number, spikeStart: number, spikeEnd: number, end: number } }}
 */
export function buildSpikePlan({
  steadyRate,
  spikeRate,
  steadySec,
  spikeSec,
  rampSec,
  watchSec,
  timeUnitSec = 1,
}) {
  for (const [name, v] of Object.entries({ steadySec, spikeSec, rampSec, watchSec })) {
    if (!(v > 0)) throw new Error(`spike plan: ${name} must be above 0 (got ${v})`);
  }
  if (!(steadyRate > 0) || !(spikeRate > steadyRate))
    throw new Error(
      `spike plan: need 0 < steadyRate < spikeRate (got ${steadyRate} and ${spikeRate})`,
    );
  const spikeStart = steadySec + rampSec;
  const spikeEnd = spikeStart + spikeSec;
  const end = spikeEnd + rampSec + watchSec;
  return {
    stages: [
      { target: steadyRate, duration: `${steadySec}s` },
      { target: spikeRate, duration: `${rampSec}s` },
      { target: spikeRate, duration: `${spikeSec}s` },
      { target: steadyRate, duration: `${rampSec}s` },
      { target: steadyRate, duration: `${watchSec}s` },
    ],
    startRate: steadyRate,
    timeUnitSec,
    rampSec,
    marks: { steadyEnd: steadySec, spikeStart, spikeEnd, end },
  };
}

/**
 * "steady" | "ramp-up" | "spike" | "ramp-down" | "recovery" at an elapsed time; undefined after the plan ends.
 * @param {ReturnType<typeof buildSpikePlan>} plan
 * @param {number} elapsedMs
 * @returns {"steady" | "ramp-up" | "spike" | "ramp-down" | "recovery" | undefined}
 */
export function phaseAt(plan, elapsedMs) {
  const t = elapsedMs / 1000;
  const m = plan.marks;
  if (t < m.steadyEnd) return "steady";
  if (t < m.spikeStart) return "ramp-up";
  if (t < m.spikeEnd) return "spike";
  if (t < m.spikeEnd + plan.rampSec) return "ramp-down";
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
