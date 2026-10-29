import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EXIT_CODES, evaluateVerdict } from "../../src/load/runner.ts";
import {
  joinVariantA,
  joinVariantB,
  type FinalRow,
  type WriteIntent,
} from "../../src/load/lost-update.ts";
import type { LoadContext, StageResult } from "../../src/load/types.ts";
import { combineVerdicts, lostUpdateOutcome } from "../../src/twenty/oracle-lost-update.ts";
import { fairnessFinding, fairnessVerdict } from "../../src/twenty/rate-limit-oracle.ts";

// evaluateVerdict reads only results, invalid and notRun, so a minimal context is enough.
function verdictOf(
  results: Partial<Record<"reconcile", StageResult>>,
  over: Partial<Pick<LoadContext, "invalid">> & { notRun?: string[] } = {},
): { outcome: string; reasons: string[] } {
  return evaluateVerdict({
    results,
    invalid: over.invalid ?? [],
    notRun: over.notRun,
    caseDef: { runs: () => [] },
    k6: [],
  } as unknown as LoadContext);
}

const ok = (over: Partial<StageResult> = {}): StageResult => ({ ok: true, reasons: [], ...over });

const variantB = (intentId: string, writer: string, record = "r1"): WriteIntent => ({
  intentId,
  variant: "B",
  recordId: record,
  field: "employees",
  writer,
  stage: 1,
  readValue: "0",
  value: "1",
  readMs: 1,
  sentMs: 2,
  ackMs: 3,
  status: 200,
  ambiguous: false,
});

const finalOf = (employees: string, record = "r1"): FinalRow => ({
  recordId: record,
  employees,
  name: "p6-qa-x",
  initialEmployees: "0",
});

describe("FINDING outcome", () => {
  it("exits 0 for a FINDING, as for a PASS", () => {
    assert.equal(EXIT_CODES.FINDING, 0);
  });

  it("a VALID run with a stage finding is FINDING, with the finding as its reason", () => {
    const v = verdictOf({ reconcile: ok({ finding: "P6-TW-LOAD-009: L was refused" }) });
    assert.equal(v.outcome, "FINDING");
    assert.deepEqual(v.reasons, ["P6-TW-LOAD-009: L was refused"]);
  });

  it("a run without a finding stays PASS", () => {
    assert.equal(verdictOf({ reconcile: ok() }).outcome, "PASS");
  });

  it("precedence: FAIL beats FINDING", () => {
    const v = verdictOf({
      reconcile: {
        ok: false,
        kind: "PRODUCT BUG",
        reasons: ["SUSPECTED: x"],
        finding: "a finding",
      },
    });
    assert.equal(v.outcome, "FAIL");
  });

  it("precedence: INVALID beats FINDING", () => {
    const v = verdictOf(
      { reconcile: ok({ finding: "P6-TW-LOAD-009: L was refused" }) },
      {
        invalid: ["cleanup: leak check failed"],
      },
    );
    assert.equal(v.outcome, "INVALID");
  });

  it("precedence: INCONCLUSIVE (a NOT RUN) beats FINDING", () => {
    const v = verdictOf(
      { reconcile: ok({ finding: "P6-TW-LOAD-009: L was refused" }) },
      {
        notRun: ["P6-TW-LOAD-010 is gated (NOT RUN)"],
      },
    );
    assert.equal(v.outcome, "INCONCLUSIVE");
  });

  it("a variant A loss is a PRODUCT BUG suspicion, so the run is FAIL and not FINDING", () => {
    const a = joinVariantA(
      [
        {
          intentId: "A1-s1-0",
          variant: "A",
          recordId: "r1",
          field: "employees",
          writer: "A1",
          stage: 1,
          readValue: null,
          value: "7",
          readMs: null,
          sentMs: 1,
          ackMs: 2,
          status: 200,
          ambiguous: false,
        },
      ],
      [finalOf("3")],
    );
    const b = joinVariantB([], []);
    const outcome = lostUpdateOutcome(combineVerdicts(a, b), a, b);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.kind, "PRODUCT BUG");
    assert.equal(verdictOf({ reconcile: outcome }).outcome, "FAIL");
  });
});

describe("P6-TW-LOAD-004 variant B (FINDING)", () => {
  it("two writers that read 0 and write 1 record a silent lost update as a FINDING", () => {
    const b = joinVariantB([variantB("B1-s1-0", "B1"), variantB("B2-s1-0", "B2")], [finalOf("1")]);
    assert.equal(b.verdict, "FINDING");
    const a = joinVariantA([], []);
    const outcome = lostUpdateOutcome(combineVerdicts(a, b), a, b);
    assert.equal(outcome.ok, true);
    assert.match(outcome.finding ?? "", /^P6-TW-LOAD-004 variant B: silent lost update/);
    const v = verdictOf({ reconcile: outcome as StageResult });
    assert.equal(v.outcome, "FINDING");
  });

  it("no lost increment is PASS, with no finding", () => {
    const b = joinVariantB([variantB("B1-s1-0", "B1")], [finalOf("1")]);
    assert.equal(b.verdict, "PASS");
    const a = joinVariantA([], []);
    const outcome = lostUpdateOutcome(combineVerdicts(a, b), a, b);
    assert.equal(outcome.finding, undefined);
    assert.equal(verdictOf({ reconcile: ok(outcome) }).outcome, "PASS");
  });
});

describe("P6-TW-LOAD-009 fairness (FINDING)", () => {
  it("L refused while F is refused is a FINDING", () => {
    const flood = [
      { tMs: 0, status: 200 },
      { tMs: 10, status: 429 },
      { tMs: 20, status: 429 },
    ];
    const low = [{ tMs: 15, status: 429 }];
    const f = fairnessVerdict(flood, low);
    assert.equal(f.verdict, "FINDING");
    assert.equal(fairnessFinding(f), `P6-TW-LOAD-009: ${f.reason}`);
    assert.equal(verdictOf({ reconcile: ok({ finding: fairnessFinding(f) }) }).outcome, "FINDING");
  });

  it("L not refused while F is refused is PASS, with no finding", () => {
    const flood = [
      { tMs: 10, status: 429 },
      { tMs: 20, status: 429 },
    ];
    const low = [{ tMs: 15, status: 200 }];
    const f = fairnessVerdict(flood, low);
    assert.equal(f.verdict, "PASS");
    assert.equal(fairnessFinding(f), undefined);
    assert.equal(verdictOf({ reconcile: ok({ finding: fairnessFinding(f) }) }).outcome, "PASS");
  });

  it("an INCONCLUSIVE judge records no finding", () => {
    const f = fairnessVerdict([{ tMs: 0, status: 200 }], [{ tMs: 0, status: 200 }]);
    assert.equal(f.verdict, "INCONCLUSIVE");
    assert.equal(fairnessFinding(f), undefined);
  });
});
