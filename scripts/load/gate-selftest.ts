// The gate self-test driver (P6-X-LOAD-008, plan Phase 4b task 12 §6.5). Starts three stubs (18080 A, 18081 B-slow, 18082 B-same),
// runs three rounds of A, B-slow and B-same (30 s each, k6/selftest/gate-slowdown.js), and classifies the p95 medians with abGate.
// Exit 0 when the gate fails the slowed candidate as a regression and passes the unchanged one; exit 1 otherwise. Usage:
//   node scripts/load/gate-selftest.ts [--out results/gate-selftest]
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { startStub } from "../../src/load/stub-server.ts";
import { abGate, type GateStatus } from "../../src/load/gate/ab-gate.ts";
import {
  checkSelftest,
  SELFTEST_BASE_SERVICE_MS,
  SELFTEST_CASE,
  SELFTEST_PORTS,
  SELFTEST_SLOW_EXTRA_MS,
  SELFTEST_TOLERANCE,
} from "../../src/load/gate/selftest.ts";

const args = process.argv.slice(2);
const run = promisify(execFile);
const outIdx = args.indexOf("--out");
const out = outIdx === -1 ? "results/gate-selftest" : (args[outIdx + 1] ?? "results/gate-selftest");
mkdirSync(out, { recursive: true });

const ROUNDS = 3;
const DURATION_SEC = 30;
const RATE = 40;

async function main(): Promise<number> {
  const stubs = [
    await startStub({
      port: SELFTEST_PORTS.a,
      serviceMs: SELFTEST_BASE_SERVICE_MS,
      stallMs: 0,
      periodMs: 1,
    }),
    await startStub({
      port: SELFTEST_PORTS.slow,
      serviceMs: SELFTEST_BASE_SERVICE_MS + SELFTEST_SLOW_EXTRA_MS,
      stallMs: 0,
      periodMs: 1,
    }),
    await startStub({
      port: SELFTEST_PORTS.same,
      serviceMs: SELFTEST_BASE_SERVICE_MS,
      stallMs: 0,
      periodMs: 1,
    }),
  ];
  try {
    const p95 = { a: [] as number[], slow: [] as number[], same: [] as number[] };
    for (let round = 1; round <= ROUNDS; round++) {
      for (const arm of ["a", "slow", "same"] as const) {
        const file = path.join(out, `${arm}-${round}.json`);
        // Async on purpose: a blocking child process would stop the in-process stubs from answering.
        await run(
          "k6",
          ["run", "--quiet", "--summary-export", file, "k6/selftest/gate-slowdown.js"],
          {
            env: {
              ...process.env,
              PORT: String(SELFTEST_PORTS[arm]),
              RATE: String(RATE),
              DURATION_SEC: String(DURATION_SEC),
            },
            maxBuffer: 16 * 1024 * 1024,
          },
        );
        const summary = JSON.parse(readFileSync(file, "utf8"));
        p95[arm].push(summary.metrics.http_req_duration["p(95)"]);
      }
    }
    const slowed = abGate({
      caseId: SELFTEST_CASE,
      aMedians: p95.a,
      bMedians: p95.slow,
      toleranceRel: SELFTEST_TOLERANCE,
      auditOk: true,
    });
    const unchanged = abGate({
      caseId: SELFTEST_CASE,
      aMedians: p95.a,
      bMedians: p95.same,
      toleranceRel: SELFTEST_TOLERANCE,
      auditOk: true,
    });
    const check = checkSelftest(slowed.verdict as GateStatus, unchanged.verdict as GateStatus);
    const text = JSON.stringify({ p95, slowed, unchanged, check }, null, 2);
    writeFileSync(path.join(out, "selftest.json"), `${text}\n`);
    console.log(
      `${SELFTEST_CASE} self-test: slowed ${slowed.verdict} (ratios ${slowed.ratios.map((r) => r.toFixed(2)).join(", ")}); unchanged ${unchanged.verdict} (ratios ${unchanged.ratios.map((r) => r.toFixed(2)).join(", ")})`,
    );
    if (!check.ok) {
      console.error(check.reasons.join("; "));
      return 1;
    }
    return 0;
  } finally {
    for (const s of stubs) await s.close();
  }
}

process.exit(await main());
