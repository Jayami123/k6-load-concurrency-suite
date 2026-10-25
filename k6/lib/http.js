import http from "k6/http";
import { sleep } from "k6";
import { Counter } from "k6/metrics";
import { classifyAttempt, runAttempts } from "./retry.js";

/** The retry cases' counters (plan task 10 §6.2). The names are the ones the audit reads (src/load/retry-validity.ts). */
export const retryCounters = {
  intents: new Counter("p6_intents"),
  intentsOk: new Counter("p6_intents_ok"),
  attempts: new Counter("p6_attempts"),
  firstTimeouts: new Counter("p6_first_timeouts"),
  retryOk: new Counter("p6_retry_ok"),
  retryConflict: new Counter("p6_retry_conflict"),
  retryRedacted400: new Counter("p6_retry_redacted400"),
  retryRefused: new Counter("p6_retry_refused"),
  retry5xx: new Counter("p6_retry_5xx"),
  orderMismatch: new Counter("p6_retry_order_mismatch"),
};

/**
 * One step of a retry plan: `parallel` identical requests with the step's timeout. One request is a plain call; more go out
 * together with http.batch. The k6 timeout aborts the connection (status 0); the server may still finish the request.
 * @param {{ timeoutMs: number, parallel: number }} step
 * @param {"GET" | "POST"} method
 * @param {string} url
 * @param {string} name
 * @param {unknown} body
 * @param {Record<string, any>} params
 */
function sendStep(step, method, url, name, body, params) {
  const p = { ...params, timeout: `${step.timeoutMs}ms`, tags: { ...(params.tags || {}), name } };
  const payload = body === undefined ? null : JSON.stringify(body);
  if (step.parallel <= 1) return [method === "GET" ? http.get(url, p) : http.post(url, payload, p)];
  return http.batch(Array.from({ length: step.parallel }, () => [method, url, payload, p]));
}

/**
 * Records one answer of the plan: every attempt, the first attempt's timeout, and the class of each retry.
 * @param {{ status: number, message: unknown }} res
 * @param {number} n the plan step of the answer (0 is the first attempt)
 */
function countAttempt(res, n) {
  retryCounters.attempts.add(1);
  const cls = classifyAttempt(res.status, res.message);
  if (cls === "server5xx") retryCounters.retry5xx.add(1);
  if (n === 0) {
    if (cls === "timeout") retryCounters.firstTimeouts.add(1);
    return;
  }
  /** @type {Record<string, import("k6/metrics").Counter>} */
  const byClass = {
    ok: retryCounters.retryOk,
    conflict: retryCounters.retryConflict,
    redacted400: retryCounters.retryRedacted400,
    refused: retryCounters.retryRefused,
  };
  if (byClass[cls] !== undefined) byClass[cls].add(1);
}

/**
 * Sends one logical request through a retry plan (plan task 10 §6.2). The body is the same object for every attempt, so the
 * audit joins the retries of one intent. `isDone(response)` (default: 2xx) ends the plan early; a done answer is classed ok.
 * Returns whether the plan resolved, whether the final answer is definite (any answer but a timeout or a 5xx), and the
 * done responses, which the journey reads.
 * @param {Array<{ timeoutMs: number, delayMs: number, parallel: number }>} plan
 * @param {"GET" | "POST"} method
 * @param {string} url
 * @param {string} name
 * @param {unknown} body
 * @param {Record<string, any>} [params]
 * @param {(r: any) => boolean} [isDone]
 */
export function retried(
  plan,
  method,
  url,
  name,
  body,
  params = {},
  isDone = (/** @type {{ status: number }} */ r) => r.status >= 200 && r.status <= 299,
) {
  /** @type {any[]} */
  const answers = [];
  const out = runAttempts(
    plan,
    (step, n) =>
      sendStep(step, method, url, name, body, params).map((r) => {
        observe(r);
        const done = isDone(r);
        if (done) answers.push(r);
        // a 2xx that is not done is classed other (300), so runAttempts does not stop on it as an ok answer
        const twoxx = r.status >= 200 && r.status <= 299;
        const res = {
          status: done ? 200 : twoxx ? 300 : r.status,
          message: safeJson(r, "message"),
        };
        countAttempt(res, n);
        return res;
      }),
    { sleep: (ms) => sleep(ms / 1000) },
  );
  const definite = out.last.some((c) => c !== "timeout" && c !== "server5xx");
  return { resolved: out.resolved, definite, answers };
}

/**
 * GET/POST with a fixed `name` tag (so no URL with an id or token becomes a metric label) and an explicit timeout.
 * @param {string} method
 * @param {string} url
 * @param {string} name
 * @param {unknown} [body]
 * @param {Record<string, unknown>} [params]
 */
export function request(method, url, name, body, params = {}) {
  const p = { ...params, tags: { ...(params.tags || {}), name } };
  return observe(
    method === "GET"
      ? http.get(url, p)
      : http.post(url, body === undefined ? null : JSON.stringify(body), p),
  );
}

/** @type {((res: any) => void) | undefined} */
let observer;

/** Every response of request() and of each retry attempt goes to fn (plan task 1 §6.3). One observer per script. */
/** @param {(res: any) => void} fn */
export function observeResponses(fn) {
  observer = fn;
}

/**
 * Passes a response to the observer and returns it. The doc-sign multipart call uses it directly (plan task 1 §6.3).
 * @param {any} res
 */
export function observe(res) {
  if (observer) observer(res);
  return res;
}

/**
 * Declares which statuses are expected so http_req_failed stays meaningful (a clean 400 refusal is not a failure; D9).
 * @param {...(number | { min: number, max: number })} extra
 */
export function expectStatuses(...extra) {
  http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, ...extra));
}

/**
 * A field of a JSON reply, or undefined when the body is not JSON (a 500 page, a proxy error). Never throws.
 * @param {{ json: (path?: string) => unknown }} r
 * @param {string} path
 */
export function safeJson(r, path) {
  try {
    return r.json(path);
  } catch {
    return undefined;
  }
}
