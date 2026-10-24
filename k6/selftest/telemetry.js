// Telemetry self-test (P6-X-LOAD-002): the Task 3 open model against the stub, with the clock markers of k6/lib/markers.js.
// The runner passes MARKER_URL; without it no offset is measured and the summary says so (marker not measured).
import { check } from "k6";
import { loadLoadConfig } from "../lib/config.js";
import { request } from "../lib/http.js";
import { clockEnd, clockOffset, clockStart } from "../lib/markers.js";
import { openModelScenario, standardOptions } from "../lib/pure/options.js";

const cfg = {
  rate: 40,
  durationSec: 30,
  maxLatencyMs: 1600,
  pre: 80,
  maxVUs: 120,
  port: 18080,
  ...loadLoadConfig([], {
    rate: "RATE",
    durationSec: "DURATION_SEC",
    maxLatencyMs: "MAX_LATENCY_MS",
    pre: "PRE",
    maxVUs: "MAXVUS",
    port: "PORT",
  }),
};
const markerUrl = __ENV.MARKER_URL;

export const options = standardOptions({
  scenarios: {
    main: openModelScenario({
      rate: cfg.rate,
      durationSec: cfg.durationSec,
      maxLatencyMs: cfg.maxLatencyMs,
      preAllocated: cfg.pre,
      maxVus: cfg.maxVUs,
    }),
  },
  thresholds: { checks: ["rate==1"] },
});

export function setup() {
  if (markerUrl) {
    const offset = clockOffset(markerUrl);
    if (offset !== undefined) clockStart.add(offset);
  }
}

export function teardown() {
  if (markerUrl) {
    const offset = clockOffset(markerUrl);
    if (offset !== undefined) clockEnd.add(offset);
  }
}

export default function () {
  const res = request("GET", `http://127.0.0.1:${cfg.port}/work`, "GET /work");
  check(res, { "status 200": (r) => r.status === 200 });
}
