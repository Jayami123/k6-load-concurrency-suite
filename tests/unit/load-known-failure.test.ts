import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CASES } from "../../src/load/cases.ts";
import { judgeKnownFailure, verdictMarker } from "../../src/load/known-failure.ts";
import { evaluateVerdict } from "../../src/load/runner.ts";
import type { LoadCase, LoadContext } from "../../src/load/types.ts";

const CASE = "P6-TW-LOAD-005";
const FINDING = "P6-TW-RACE-004";
const known = { findingId: FINDING };

describe("known-failure judgement (run-load)", () => {
  it("an expected FAIL on a VALID run exits 0 and says so", () => {
    const j = judgeKnownFailure(CASE, known, "FAIL", true, 1);
    assert.equal(j.exitCode, 0);
    assert.equal(j.line, `${CASE} FAIL (expected, ${FINDING})`);
    assert.match(j.summary ?? "", /reproduced \(expected\)/);
  });

  it("an unexpected PASS on a VALID run exits 1 and asks for the marker to be removed", () => {
    const j = judgeKnownFailure(CASE, known, "PASS", true, 0);
    assert.equal(j.exitCode, 1);
    assert.equal(
      j.line,
      `${CASE} PASS (unexpected: ${FINDING} no longer reproduces, remove the knownFailure marker)`,
    );
  });

  it("an INVALID run keeps its exit code and prints no marker line", () => {
    const j = judgeKnownFailure(CASE, known, "FAIL", false, 1);
    assert.deepEqual(j, { exitCode: 1 });
    assert.deepEqual(judgeKnownFailure(CASE, known, "PASS", false, 0), { exitCode: 0 });
  });

  it("an INCONCLUSIVE run keeps its exit code", () => {
    assert.deepEqual(judgeKnownFailure(CASE, known, "INCONCLUSIVE", true, 0), { exitCode: 0 });
  });

  it("an ENV outcome keeps its exit code", () => {
    assert.deepEqual(judgeKnownFailure(CASE, known, "ENV", true, 2), { exitCode: 2 });
  });

  it("a case without the marker is unchanged, for FAIL and PASS", () => {
    assert.deepEqual(judgeKnownFailure("P6-TW-LOAD-006", undefined, "FAIL", true, 1), {
      exitCode: 1,
    });
    assert.deepEqual(judgeKnownFailure("P6-TW-LOAD-006", undefined, "PASS", true, 0), {
      exitCode: 0,
    });
  });
});

describe("known-failure marker (registry and verdict.json)", () => {
  it("P6-TW-LOAD-005 carries the marker and nothing else changes in its outcome", () => {
    assert.deepEqual(CASES[CASE]?.knownFailure, known);
    const ctx = {
      caseDef: { id: CASE, runs: () => [] } as unknown as LoadCase,
      k6: [],
      results: { reconcile: { ok: false, kind: "PRODUCT BUG", reasons: ["x"] } },
      invalid: [],
      handles: {},
    } as unknown as LoadContext;
    assert.equal(evaluateVerdict(ctx).outcome, "FAIL", "verdict.json keeps the real FAIL");
  });

  it("verdict.json names the marker beside the outcome; a case without one has no such key", () => {
    assert.deepEqual(verdictMarker(known), { expectedFailure: { findingId: FINDING } });
    assert.deepEqual(verdictMarker(undefined), {});
  });

  it("P6-TW-LOAD-011 does not inherit the marker from -005, and -006 has none", () => {
    assert.equal(CASES["P6-TW-LOAD-011"]?.knownFailure, undefined);
    assert.equal(CASES["P6-TW-LOAD-006"]?.knownFailure, undefined);
  });
});
