import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LoadRunRecord } from "../../src/load/medians.ts";
import {
  buildSmokeBaseline,
  parseSmokeBaseline,
  type SmokeBaseline,
  type SmokeCaseId,
} from "../../src/load/smoke-baseline.ts";
import type { RunMeta } from "../../src/load/types.ts";

function run(
  caseId: SmokeCaseId,
  runId: string,
  p95Ms: number,
  over: { outcome?: string; validity?: string; event?: string; profile?: string } = {},
): LoadRunRecord {
  return {
    verdict: {
      runId,
      outcome: over.outcome ?? "PASS",
      validity: { verdict: over.validity ?? "VALID" },
      k6: [{ p95Ms }],
    } as LoadRunRecord["verdict"],
    meta: {
      schema: 1,
      caseId,
      runId,
      profile: over.profile ?? "full",
      rate: 2,
      durationSec: 30,
      environment: {
        kind: "github-actions",
        event: over.event ?? "workflow_dispatch",
        ref: "main",
        runUrl: `https://github.com/o/r/actions/runs/${runId}`,
        runnerImage: "ubuntu24",
        imageVersion: "20261023.334.3",
        nproc: 4,
      },
      software: { products: { cal: "x" } },
    } as unknown as RunMeta,
  };
}

const three = (caseId: SmokeCaseId, a: number, b: number, c: number) => [
  run(caseId, "1001", a),
  run(caseId, "1002", b),
  run(caseId, "1003", c),
];

function input(over: Partial<Record<SmokeCaseId, LoadRunRecord[]>> = {}) {
  return {
    release: "p6-phase3",
    runs: {
      "P6-CAL-LOAD-001": three("P6-CAL-LOAD-001", 100, 200, 300),
      "P6-MED-LOAD-001": three("P6-MED-LOAD-001", 50, 60, 70),
      "P6-DOC-LOAD-001": three("P6-DOC-LOAD-001", 900, 800, 700),
      ...over,
    },
  };
}

describe("smoke baseline", () => {
  it("takes the median of three p95 values per case", () => {
    const b = buildSmokeBaseline(input());
    assert.equal(b.cases["P6-CAL-LOAD-001"].medianP95Ms, 200);
    assert.equal(b.cases["P6-MED-LOAD-001"].medianP95Ms, 60);
    assert.equal(b.cases["P6-DOC-LOAD-001"].medianP95Ms, 800);
  });

  it("four runs take the mean of the two middle values", () => {
    const four = [...three("P6-CAL-LOAD-001", 100, 200, 300), run("P6-CAL-LOAD-001", "1004", 400)];
    const b = buildSmokeBaseline(input({ "P6-CAL-LOAD-001": four }));
    assert.equal(b.cases["P6-CAL-LOAD-001"].medianP95Ms, 250);
    assert.equal(b.cases["P6-CAL-LOAD-001"].n, 4);
  });

  it("an INVALID run is excluded with its reason", () => {
    const runs = [
      ...three("P6-CAL-LOAD-001", 100, 200, 300),
      run("P6-CAL-LOAD-001", "1004", 9999, { validity: "INVALID" }),
    ];
    const b = buildSmokeBaseline(input({ "P6-CAL-LOAD-001": runs }));
    assert.equal(b.cases["P6-CAL-LOAD-001"].n, 3);
    assert.equal(b.cases["P6-CAL-LOAD-001"].medianP95Ms, 200);
  });

  it("a push-event run and a pr-profile run are excluded", () => {
    const runs = [
      ...three("P6-CAL-LOAD-001", 100, 200, 300),
      run("P6-CAL-LOAD-001", "1004", 9999, { event: "push" }),
      run("P6-CAL-LOAD-001", "1005", 9999, { profile: "pr" }),
    ];
    const b = buildSmokeBaseline(input({ "P6-CAL-LOAD-001": runs }));
    assert.equal(b.cases["P6-CAL-LOAD-001"].n, 3);
  });

  it("fewer than three usable runs throws and names the case", () => {
    const two = [run("P6-CAL-LOAD-001", "1001", 100), run("P6-CAL-LOAD-001", "1002", 200)];
    assert.throws(
      () => buildSmokeBaseline(input({ "P6-CAL-LOAD-001": two })),
      /P6-CAL-LOAD-001: 2 usable/,
    );
  });

  it("parseSmokeBaseline accepts a valid file", () => {
    const b = buildSmokeBaseline(input());
    assert.doesNotThrow(() => parseSmokeBaseline(JSON.parse(JSON.stringify(b))));
  });

  it("parseSmokeBaseline rejects n that differs from runIds.length", () => {
    const b = JSON.parse(JSON.stringify(buildSmokeBaseline(input()))) as SmokeBaseline;
    b.cases["P6-CAL-LOAD-001"].n = 4;
    assert.throws(() => parseSmokeBaseline(b), /has n 4 for 3 run ids/);
  });

  it("parseSmokeBaseline rejects duplicate run ids and a missing case", () => {
    const dup = JSON.parse(JSON.stringify(buildSmokeBaseline(input()))) as SmokeBaseline;
    dup.cases["P6-CAL-LOAD-001"].runIds = ["1001", "1001", "1003"];
    assert.throws(() => parseSmokeBaseline(dup), /duplicate or non-numeric/);
    const missing = JSON.parse(JSON.stringify(buildSmokeBaseline(input()))) as SmokeBaseline;
    delete (missing.cases as Partial<SmokeBaseline["cases"]>)["P6-DOC-LOAD-001"];
    assert.throws(() => parseSmokeBaseline(missing), /P6-DOC-LOAD-001 is missing/);
  });
});
