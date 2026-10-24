// Coordinated-omission self-test (P6-X-LOAD-001). One script, three runs: an open model at the planned rate, a closed model,
// and an under-sized open model. The runner passes the run through P6_LOAD_CONFIG (k6-config.json) and the env names below.
//
// Standalone (plan §6.9), against a stub started by hand:
//   node src/load/stub-server.ts 18080 25 1500 10000
//   MODEL=open RATE=40 DURATION_SEC=30 MAX_LATENCY_MS=1600 PORT=18080 k6 run k6/selftest/coordinated-omission.js
import { check, sleep } from "k6";
import { loadLoadConfig } from "../lib/config.js";
import { request } from "../lib/http.js";
import { closedModelScenario, openModelScenario, standardOptions } from "../lib/pure/options.js";

// Defaults equal k6/selftest/config.example.json. They let `k6 inspect` run the init context without a config file;
// a real run always passes every value through P6_LOAD_CONFIG, which wins over these.
const cfg = {
  model: "open",
  rate: 40,
  durationSec: 30,
  maxLatencyMs: 1600,
  pre: 80,
  maxVUs: 120,
  port: 18080,
  ...loadLoadConfig([], {
    model: "MODEL",
    rate: "RATE",
    durationSec: "DURATION_SEC",
    maxLatencyMs: "MAX_LATENCY_MS",
    pre: "PRE",
    maxVUs: "MAXVUS",
    port: "PORT",
  }),
};

const scenario =
  cfg.model === "closed"
    ? closedModelScenario({ vus: cfg.pre ?? 10, durationSec: cfg.durationSec })
    : openModelScenario({
        rate: cfg.rate,
        durationSec: cfg.durationSec,
        maxLatencyMs: cfg.maxLatencyMs,
        preAllocated: cfg.pre,
        maxVus: cfg.maxVUs,
      });

export const options = standardOptions({
  scenarios: { main: scenario },
  thresholds: { checks: ["rate==1"] },
});

export default function () {
  const res = request("GET", `http://127.0.0.1:${cfg.port}/work`, "GET /work");
  check(res, { "status 200": (r) => r.status === 200 });
  if (cfg.model === "closed") sleep(0.075);
}
