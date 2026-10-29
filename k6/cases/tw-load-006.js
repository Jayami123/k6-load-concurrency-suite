// P6-TW-LOAD-006 (Twenty plan, rate-limit contract): one API key, GET /rest/companies?limit=1 through four phases on the
// production-like profile (image defaults). The phases are arrival-rate scenarios with start offsets; the recovery probe is
// one VU that asks once per second until the first 200. One `TW006 {json}` line per request; the runner's oracle judges them.
// The workspace key arrives in TWENTY_API_KEYS only (the first entry), never in the config file, and is never logged.
import http from "k6/http";
import { sleep } from "k6";
import { loadLoadConfig } from "../lib/config.js";
import { standardOptions } from "../lib/pure/options.js";
import { authorizationHeader, restHeaders } from "../lib/twenty-auth.js";
import { clockHooks } from "../lib/markers.js";

// The sustained limit of the image (config-variables.ts LONG_LIMIT, 100 per 60 s). The phases derive from it (0.6x, 1.0x, 2.0x).
const SUSTAINED_PER_MIN = 100;
const PHASE_SEC = 120;
const IDLE_SEC = 60;
const RECOVERY_MAX_SEC = 60;

const cfg = {
  baseUrl: "http://127.0.0.1:3002",
  ...loadLoadConfig([]),
};

const tags = { case: "P6-TW-LOAD-006" };
const RATE_HEADERS = ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"];

/** The value of a response header, matched without case, or null. @param {any} res @param {string} name */
function headerOf(res, name) {
  const want = name.toLowerCase();
  for (const key of Object.keys(res.headers)) {
    if (key.toLowerCase() === want) return res.headers[key];
  }
  return null;
}

/** Reads a 429 body for its error, periodCount and scope key names. Values other than these are never read. @param {any} res */
function limitBody(res) {
  /** @type {any} */
  let body = null;
  try {
    body = JSON.parse(res.body);
  } catch (_) {
    body = null;
  }
  if (!body || typeof body !== "object")
    return { errorCode: null, periodCount: null, scopeKeys: [] };
  return {
    errorCode: typeof body.error === "string" ? body.error : null,
    periodCount: typeof body.periodCount === "number" ? body.periodCount : null,
    scopeKeys: body.scope && typeof body.scope === "object" ? Object.keys(body.scope) : [],
  };
}

/** One request in a phase: records its status and the contract fields, and prints one line. @param {string} phase */
function probe(phase) {
  const t = Date.now();
  const headers = restHeaders(authorizationHeader());
  const res = http.get(`${cfg.baseUrl}/rest/companies?limit=1`, {
    headers,
    tags: { ...tags, phase },
  });
  const rec = {
    phase,
    tMs: t,
    status: res.status,
    retryAfter: headerOf(res, "retry-after"),
    hasRateHeaders: RATE_HEADERS.every((h) => headerOf(res, h) !== null),
    ...(res.status === 429
      ? limitBody(res)
      : { errorCode: null, periodCount: null, scopeKeys: [] }),
  };
  console.log(`TW006 ${JSON.stringify(rec)}`);
  return rec;
}

// Phase starts (seconds from the test start): below 0, idle, at 180, idle, above 360, recovery at 480 (the above stops).
const PHASE_START = { below: 0, at: PHASE_SEC + IDLE_SEC, above: 2 * (PHASE_SEC + IDLE_SEC) };
const RECOVERY_START = PHASE_START.above + PHASE_SEC;

export const options = standardOptions({
  scenarios: {
    below: {
      executor: "constant-arrival-rate",
      rate: Math.round(SUSTAINED_PER_MIN * 0.6),
      timeUnit: "60s",
      duration: `${PHASE_SEC}s`,
      preAllocatedVUs: 5,
      maxVUs: 20,
      startTime: `${PHASE_START.below}s`,
      exec: "below",
      tags,
    },
    at: {
      executor: "constant-arrival-rate",
      rate: SUSTAINED_PER_MIN,
      timeUnit: "60s",
      duration: `${PHASE_SEC}s`,
      preAllocatedVUs: 5,
      maxVUs: 20,
      startTime: `${PHASE_START.at}s`,
      exec: "at",
      tags,
    },
    above: {
      executor: "constant-arrival-rate",
      rate: SUSTAINED_PER_MIN * 2,
      timeUnit: "60s",
      duration: `${PHASE_SEC}s`,
      preAllocatedVUs: 5,
      maxVUs: 20,
      startTime: `${PHASE_START.above}s`,
      exec: "above",
      tags,
    },
    recovery: {
      executor: "per-vu-iterations",
      vus: 1,
      iterations: 1,
      maxDuration: `${RECOVERY_MAX_SEC + 30}s`,
      startTime: `${RECOVERY_START}s`,
      exec: "recovery",
      tags,
    },
  },
  tags,
});

export const { setup, teardown } = clockHooks(__ENV.MARKER_URL);

export function below() {
  probe("below");
}

export function at() {
  probe("at");
}

export function above() {
  probe("above");
}

/** Once per second until the first 200, at most RECOVERY_MAX_SEC requests. */
export function recovery() {
  for (let i = 0; i < RECOVERY_MAX_SEC; i++) {
    const rec = probe("recovery");
    if (rec.status === 200) break;
    sleep(1);
  }
}
