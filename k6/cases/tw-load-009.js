// P6-TW-LOAD-009 (Twenty plan, limiter fairness, gated extra): key F floods at the -006 above rate (200 per 60 s) and key L
// asks at 12 per 60 s, both for 120 s on one clock. One `TW009 {json}` line per request: the key's name (F or L), the time and
// the status. The keys arrive in TWENTY_API_KEYS (F is the first entry, L the second) and are never logged.
import http from "k6/http";
import { loadLoadConfig } from "../lib/config.js";
import { standardOptions } from "../lib/pure/options.js";
import { authorizationHeader, restHeaders } from "../lib/twenty-auth.js";
import { clockHooks } from "../lib/markers.js";

const FLOOD_PER_MIN = 200;
const LOW_PER_MIN = 12;
const DURATION_SEC = 120;

const cfg = {
  baseUrl: "http://127.0.0.1:3002",
  ...loadLoadConfig([]),
};

const tags = { case: "P6-TW-LOAD-009" };

// F is the setup key (the first entry, through authorizationHeader()); L is the second entry. Read per request, so the init
// context (k6 inspect) runs without the keys.
/** The "Bearer <key>" of the second entry of TWENTY_API_KEYS. A TEST BUG when there is no second key. */
function lowAuthorization() {
  /** @type {any} */
  let keys = [];
  try {
    keys = JSON.parse(__ENV.TWENTY_API_KEYS || "[]");
  } catch (_) {
    keys = [];
  }
  if (!Array.isArray(keys) || typeof keys[1] !== "string" || keys[1] === "") {
    throw new Error("TEST BUG: P6-TW-LOAD-009 needs two keys in TWENTY_API_KEYS");
  }
  return `Bearer ${keys[1]}`;
}

/** One request with one key: prints the key's name, the time and the status. @param {string} key @param {any} headers */
function probe(key, headers) {
  const t = Date.now();
  const res = http.get(`${cfg.baseUrl}/rest/companies?limit=1`, {
    headers,
    tags: { ...tags, key },
  });
  console.log(`TW009 ${JSON.stringify({ key, tMs: t, status: res.status })}`);
}

export const options = standardOptions({
  scenarios: {
    flood: {
      executor: "constant-arrival-rate",
      rate: FLOOD_PER_MIN,
      timeUnit: "60s",
      duration: `${DURATION_SEC}s`,
      preAllocatedVUs: 5,
      maxVUs: 20,
      exec: "flood",
      tags,
    },
    low: {
      executor: "constant-arrival-rate",
      rate: LOW_PER_MIN,
      timeUnit: "60s",
      duration: `${DURATION_SEC}s`,
      preAllocatedVUs: 2,
      maxVUs: 5,
      exec: "low",
      tags,
    },
  },
  tags,
});

export const { setup, teardown } = clockHooks(__ENV.MARKER_URL);

export function flood() {
  probe("F", restHeaders(authorizationHeader()));
}

export function low() {
  probe("L", restHeaders(lowAuthorization()));
}
