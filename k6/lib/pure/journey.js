// Composable journey steps. All k6 calls are injected through deps, so Node tests can drive the journey.

/**
 * @typedef {{ name: string, run: (state: Record<string, unknown>) => { ok: boolean, data?: Record<string, unknown> }, thinkSec?: number }} JourneyStep
 * @typedef {{ check: (name: string, ok: boolean) => void, sleep: (sec: number) => void, now: () => number }} JourneyDeps
 */

/**
 * A failed step ends the journey (later steps need its output). Returns the per-step record the audit joins on.
 * @param {{ steps: JourneyStep[], state?: Record<string, unknown>, deps: JourneyDeps }} o
 */
export function runJourney({ steps, state = {}, deps }) {
  /** @type {Array<{ name: string, ok: boolean, ms: number }>} */
  const record = [];
  for (const step of steps) {
    const t0 = deps.now();
    const result = step.run(state);
    deps.check(`${step.name}`, result.ok);
    record.push({ name: step.name, ok: result.ok, ms: deps.now() - t0 });
    if (!result.ok) return { completed: false, failedStep: step.name, steps: record, state };
    if (result.data) Object.assign(state, result.data);
    if (step.thinkSec) deps.sleep(step.thinkSec);
  }
  return { completed: true, failedStep: null, steps: record, state };
}
