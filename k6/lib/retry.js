// Retry plans for the retry storm cases (plan task 10 §6.2). Pure: no k6 import. The journeys inject the k6 calls.

/** The redacted message of a Cal 400 reply that overlaps an in-flight request (P6-OBS-CAL-001). */
export const CAL_REDACTED = "An error occurred while querying the database.";

/**
 * The storm steps send the same request with a short timeout; the final step waits for the server so every intent
 * ends with a definite answer. parallelRetries > 1 sends that many identical requests together in the final step.
 * @param {{ stormTimeoutMs: number, stormAttempts: number, parallelRetries?: number, finalTimeoutMs: number, delayMs: number }} spec
 * @returns {Array<{ timeoutMs: number, delayMs: number, parallel: number }>}
 */
export function buildPlan(spec) {
  const storm = Array.from({ length: spec.stormAttempts }, () => ({
    timeoutMs: spec.stormTimeoutMs,
    delayMs: spec.delayMs,
    parallel: 1,
  }));
  return [
    ...storm,
    { timeoutMs: spec.finalTimeoutMs, delayMs: spec.delayMs, parallel: spec.parallelRetries ?? 1 },
  ];
}

/**
 * "ok" (2xx) | "timeout" (status 0) | "conflict" (409) | "redacted400" (400 with the Cal redacted message) | "refused" (other 4xx) | "server5xx" | "other".
 * @param {number} status
 * @param {unknown} message the reply's message, when the body is JSON
 * @returns {"ok" | "timeout" | "conflict" | "redacted400" | "refused" | "server5xx" | "other"}
 */
export function classifyAttempt(status, message) {
  if (status === 0) return "timeout";
  if (status >= 200 && status <= 299) return "ok";
  if (status === 409) return "conflict";
  if (status === 400 && String(message || "").includes(CAL_REDACTED)) return "redacted400";
  if (status >= 400 && status <= 499) return "refused";
  if (status >= 500 && status <= 599) return "server5xx";
  return "other";
}

/**
 * Sends the SAME request for each plan step until one answer is "ok" or the plan ends. send(step, n) returns an array of
 * `parallel` results, each { status, message }. deps: { sleep(ms) }. Sleeps only between steps, and only when delayMs > 0.
 * The logical-request id is not made here: the caller passes the same body each time, so the audit joins retries by it.
 * @param {Array<{ timeoutMs: number, delayMs: number, parallel: number }>} plan
 * @param {(step: { timeoutMs: number, delayMs: number, parallel: number }, n: number) => Array<{ status: number, message?: unknown }>} send
 * @param {{ sleep: (ms: number) => void }} deps
 * @returns {{ attempts: Array<{ n: number, class: string }>, resolved: boolean, last: string[] }}
 */
export function runAttempts(plan, send, deps) {
  /** @type {Array<{ n: number, class: string }>} */
  const attempts = [];
  let last = /** @type {string[]} */ ([]);
  for (const [n, step] of plan.entries()) {
    if (n > 0 && step.delayMs > 0) deps.sleep(step.delayMs);
    const results = send(step, n);
    last = results.map((r) => classifyAttempt(r.status, r.message));
    for (const cls of last) attempts.push({ n, class: cls });
    if (last.includes("ok")) return { attempts, resolved: true, last };
  }
  return { attempts, resolved: false, last };
}
