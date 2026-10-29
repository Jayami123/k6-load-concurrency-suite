// P6-TW-LOAD-004 (lost update under sustained edits). Two variant A writers (A1 sets employees, A2 sets name, one request in flight
// each), two variant B writers (B1, B2: GET then PATCH employees = read + 1), one scenario per writer and stage, and the foundation
// background at the pr rate. Every write attempt is one TW004 line on stdout; src/twenty/oracle-lost-update.ts judges the lines.
// The API key arrives in TWENTY_API_KEYS only (secretEnv), never in the config file.
import http from "k6/http";
import exec from "k6/execution";
import { Counter } from "k6/metrics";
import { loadLoadConfig } from "../lib/config.js";
import { openModelScenario, standardOptions } from "../lib/pure/options.js";
import { authorizationHeader, restHeaders } from "../lib/twenty-auth.js";
import { runTwBackground } from "../journeys/tw-background.js";
import { clockHooks } from "../lib/markers.js";

export const limited429Counter = new Counter("p6_t4_429");
export const serverErrorCounter = new Counter("p6_t4_5xx");
export const readFailCounter = new Counter("p6_t4_read_fail");

// Defaults equal the pr profile, so `k6 inspect` runs the init context without a config file. A real run passes every value
// through P6_LOAD_CONFIG (the runner writes ctx.config and the t4 block set by setup), which wins over these.
/** @type {any} */
const cfg = {
  rate: 1,
  durationSec: 120,
  maxLatencyMs: 4000,
  baseUrl: "http://127.0.0.1:3002",
  prefix: "p6-qa-00000000t000000z-00000000-p6-tw-load-004",
  t4: { records: { a: [], b: [] }, stageRates: [0.5], stageSec: 120, initialEmployees: "0" },
  ...loadLoadConfig([]),
};

const CASE = "P6-TW-LOAD-004";
const base = cfg.baseUrl.replace(/\/$/, "");
const WRITERS = [
  { writer: "A1", variant: "A", exec: "writeA" },
  { writer: "A2", variant: "A", exec: "writeA" },
  { writer: "B1", variant: "B", exec: "writeB" },
  { writer: "B2", variant: "B", exec: "writeB" },
];

/** Scenario `a1-s2` names the writer and the stage the iteration belongs to. @param {string} name */
function parseName(name) {
  const [writer = "", stageTag = ""] = name.split("-");
  return { writer: writer.toUpperCase(), stage: Number(stageTag.slice(1)) };
}

/** The k6 ids of one scenario per writer and stage. Each writer is serial: one VU, one request in flight. @returns {Record<string, unknown>} */
function scenarios() {
  /** @type {Record<string, any>} */
  const out = {
    journey: openModelScenario({
      rate: cfg.rate,
      durationSec: cfg.durationSec,
      maxLatencyMs: cfg.maxLatencyMs,
      exec: "journey",
      tags: { case: CASE, journey: "tw-background" },
    }),
  };
  cfg.t4.stageRates.forEach((/** @type {number} */ rate, /** @type {number} */ index) => {
    const stage = index + 1;
    for (const w of WRITERS) {
      out[`${w.writer.toLowerCase()}-s${stage}`] = openModelScenario({
        rate,
        timeUnitSec: 2,
        durationSec: cfg.t4.stageSec,
        startTimeSec: index * cfg.t4.stageSec,
        preAllocated: 1,
        maxVus: 1,
        exec: w.exec,
        tags: { case: CASE, writer: w.writer, stage: String(stage) },
      });
    }
  });
  return out;
}

export const options = standardOptions({
  scenarios: scenarios(),
  // Only the background's own check assertions. A 429 or 5xx on a write is not a k6 failure: it makes the run INVALID (oracle).
  thresholds: { checks: ["rate==1"] },
  tags: { case: CASE },
});

export const { setup, teardown } = clockHooks(__ENV.MARKER_URL);

/** One TW004 line per attempt. @param {Record<string, unknown>} intent */
function logIntent(intent) {
  console.log(`TW004 ${JSON.stringify(intent)}`);
}

/** @param {any} res */
function observe(res) {
  if (res.status === 429) limited429Counter.add(1);
  if (res.status >= 500) serverErrorCounter.add(1);
}

/** @param {any} res @param {string} path @returns {any} */
function fieldOf(res, path) {
  try {
    return res.json(path);
  } catch (_) {
    return undefined;
  }
}

/** Variant A: one PATCH. A1 sets employees to a value no other attempt writes; A2 sets name. */
export function writeA() {
  const { writer, stage } = parseName(exec.scenario.name);
  const seq = exec.scenario.iterationInTest;
  const records = cfg.t4.records.a;
  const recordId = records[seq % records.length];
  const headers = restHeaders(authorizationHeader());
  const field = writer === "A1" ? "employees" : "name";
  const value =
    writer === "A1" ? 1000000 + stage * 10000 + seq : `${cfg.prefix}-a2-s${stage}-${seq}`;
  const body = field === "employees" ? { employees: value } : { name: value };
  const sentMs = Date.now();
  const res = http.patch(`${base}/rest/companies/${recordId}`, JSON.stringify(body), {
    headers,
    tags: { op: "t4-write-a" },
  });
  const ackMs = Date.now();
  observe(res);
  logIntent({
    intentId: `${writer}-s${stage}-${seq}`,
    variant: "A",
    recordId,
    field,
    writer,
    stage,
    readValue: null,
    value: String(value),
    readMs: null,
    sentMs,
    ackMs,
    status: res.status,
    ambiguous: res.status === 0 || res.status >= 500,
  });
}

/** Variant B: GET the record, then PATCH employees = the value read + 1. A failed read writes nothing and is counted. */
export function writeB() {
  const { writer, stage } = parseName(exec.scenario.name);
  const seq = exec.scenario.iterationInTest;
  const records = cfg.t4.records.b;
  const recordId = records[(stage - 1) * 2 + (seq % 2)];
  const headers = restHeaders(authorizationHeader());
  const readMs = Date.now();
  const get = http.get(`${base}/rest/companies/${recordId}`, { headers, tags: { op: "t4-read" } });
  observe(get);
  const read = get.status === 200 ? fieldOf(get, "data.company.employees") : undefined;
  if (typeof read !== "number" || !Number.isInteger(read)) {
    readFailCounter.add(1);
    return;
  }
  const value = read + 1;
  const sentMs = Date.now();
  const res = http.patch(
    `${base}/rest/companies/${recordId}`,
    JSON.stringify({ employees: value }),
    {
      headers,
      tags: { op: "t4-write-b" },
    },
  );
  const ackMs = Date.now();
  observe(res);
  logIntent({
    intentId: `${writer}-s${stage}-${seq}`,
    variant: "B",
    recordId,
    field: "employees",
    writer,
    stage,
    readValue: String(read),
    value: String(value),
    readMs,
    sentMs,
    ackMs,
    status: res.status,
    ambiguous: res.status === 0 || res.status >= 500,
  });
}

/** The foundation background (4 requests per iteration), at the pr rate for the whole case. */
export function journey() {
  runTwBackground(cfg, {});
}
