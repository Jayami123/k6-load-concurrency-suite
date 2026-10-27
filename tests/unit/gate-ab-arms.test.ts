import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { readAbArm } from "../../src/load/gate/ab-arms.ts";

const CASE = "P6-MED-LOAD-002";
const RUN = "20261027T132645Z-1e83bcde";

/** An arm folder as run-load writes it; each file is optional so a test can leave one out. */
function armDir(files: { verdict?: object; meta?: object; summary?: object }): string {
  const dir = path.join(mkdtempSync(path.join(tmpdir(), "ab-arm-")), "P6-MED-LOAD-002", RUN);
  mkdirSync(dir, { recursive: true });
  if (files.verdict) writeFileSync(path.join(dir, "verdict.json"), JSON.stringify(files.verdict));
  if (files.meta) writeFileSync(path.join(dir, "run-meta.json"), JSON.stringify(files.meta));
  if (files.summary)
    writeFileSync(path.join(dir, "k6-main-summary.json"), JSON.stringify(files.summary));
  return dir;
}

const meta = {
  schema: 1,
  caseId: CASE,
  runId: RUN,
  startedAt: "2026-10-27T13:26:45.000Z",
  environment: {
    kind: "github-actions",
    runUrl: "https://github.com/o/r/actions/runs/40511560394",
  },
  software: { products: { medusa: "x" } },
};
const summary = {
  metrics: {
    http_req_duration: { med: 110, "p(95)": 220.5, "p(99)": 260 },
    http_req_failed: { value: 0 },
    http_reqs: { rate: 0.7 },
  },
};

describe("a/b arm reading", () => {
  it("excludes an arm whose verdict exists but whose summary is missing (ENV), instead of throwing ENOENT", () => {
    const dir = armDir({
      verdict: { outcome: "PASS", validity: { verdict: "VALID" } },
      meta,
    });
    const arm = readAbArm(dir, CASE);
    assert.equal(arm.counted, undefined);
    assert.equal(arm.excluded?.env, true);
    assert.match(arm.excluded!.reason, /no k6-main-summary\.json/);
  });

  it("excludes an arm whose own outcome is ENV with its reason, and excludes an arm with no folder contents as ENV", () => {
    const envArm = readAbArm(
      armDir({
        verdict: {
          outcome: "ENV",
          validity: { verdict: "INVALID", reasons: [{ code: "no_reference" }] },
        },
        meta,
      }),
      CASE,
    );
    assert.equal(envArm.counted, undefined);
    assert.equal(envArm.excluded?.env, true);
    assert.match(envArm.excluded!.reason, /outcome is ENV/);
    const empty = readAbArm(armDir({}), CASE);
    assert.equal(empty.excluded?.env, true);
    assert.match(empty.excluded!.reason, /no verdict\.json/);
  });

  it("counts a complete VALID PASS arm with its run-level p95", () => {
    const arm = readAbArm(
      armDir({
        verdict: { outcome: "PASS", validity: { verdict: "VALID" } },
        meta,
        summary,
      }),
      CASE,
    );
    assert.equal(arm.excluded, undefined);
    assert.deepEqual(arm.counted, { runId: "40511560394", p95Ms: 220.5 });
  });
});
