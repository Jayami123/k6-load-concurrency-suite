import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countOverlapWindows,
  dedupeIntents,
  joinVariantA,
  joinVariantB,
  lossRate,
  type FinalRow,
  type WriteIntent,
} from "../../src/load/lost-update.ts";

// Builders: one attempt per call. Times are k6 clock milliseconds in the fixtures.
function a(
  intentId: string,
  field: "employees" | "name",
  value: string,
  sentMs: number,
  opts: Partial<WriteIntent> = {},
): WriteIntent {
  return {
    intentId,
    variant: "A",
    recordId: "rec-1",
    field,
    writer: field === "employees" ? "A1" : "A2",
    stage: 1,
    readValue: null,
    value,
    readMs: null,
    sentMs,
    ackMs: sentMs + 5,
    status: 200,
    ambiguous: false,
    ...opts,
  };
}

function b(
  intentId: string,
  writer: "B1" | "B2",
  readValue: string,
  readMs: number,
  ackMs: number,
  opts: Partial<WriteIntent> = {},
): WriteIntent {
  return {
    intentId,
    variant: "B",
    recordId: "rec-b",
    field: "employees",
    writer,
    stage: 1,
    readValue,
    value: String(Number(readValue) + 1),
    readMs,
    sentMs: readMs + 1,
    ackMs,
    status: 200,
    ambiguous: false,
    ...opts,
  };
}

const finalA = (employees: string, name: string): FinalRow[] => [
  { recordId: "rec-1", employees, name, initialEmployees: "0" },
];
const finalB = (employees: string, initial = "0"): FinalRow[] => [
  { recordId: "rec-b", employees, name: null, initialEmployees: initial },
];

describe("lost update join", () => {
  it("variant A: no loss when both fields keep their last acknowledged write", () => {
    const intents = [a("A1-1", "employees", "1000001", 10), a("A2-1", "name", "n-2", 20)];
    const r = joinVariantA(intents, finalA("1000001", "n-2"));
    assert.equal(r.lostA, 0);
    assert.equal(r.verdict, "PASS");
  });

  it("variant A: a final name that is the first acknowledged value is a lost write", () => {
    const intents = [a("A2-1", "name", "n-1", 10), a("A2-2", "name", "n-2", 20)];
    const r = joinVariantA(intents, finalA("0", "n-1"));
    assert.equal(r.lostA, 1);
    assert.equal(r.verdict, "PRODUCT_BUG_SUSPECTED");
    assert.match(r.verdictReason, /rec-1\.name last acked A2-2/);
  });

  it("variant A: a final equal to a later ambiguous write is ambiguous, not lost", () => {
    const intents = [
      a("A2-1", "name", "n-1", 10),
      a("A2-2", "name", "n-2", 30, { ambiguous: true, status: 0 }),
    ];
    const r = joinVariantA(intents, finalA("0", "n-2"));
    assert.equal(r.lostA, 0);
    assert.equal(r.ambiguousA, 1);
    assert.equal(r.verdict, "PASS");
  });

  it("variant B: two sequential increments with no overlap are a pass with no contention", () => {
    const intents = [b("B1-1", "B1", "0", 0, 10), b("B1-2", "B1", "1", 20, 30)];
    const r = joinVariantB(intents, finalB("2"));
    assert.equal(r.records[0]!.lostLower, 0);
    assert.equal(r.overlapWindows, 0);
    assert.equal(r.verdict, "PASS");
    assert.match(r.verdictReason, /no contention reached/);
  });

  it("variant B: two overlapping writers that both read 5 and write 6 lose one increment", () => {
    const intents = [b("B1-1", "B1", "5", 0, 20), b("B2-1", "B2", "5", 5, 25)];
    const r = joinVariantB(intents, finalB("6", "5"));
    assert.equal(r.acked, 2);
    assert.equal(r.records[0]!.observed, 1);
    assert.equal(r.records[0]!.lostLower, 1);
    assert.equal(r.overlapWindows, 1);
    assert.equal(r.verdict, "FINDING");
  });

  it("variant B: a timed-out increment that applied bounds nothing", () => {
    const intents = [
      b("B1-1", "B1", "0", 0, 10),
      b("B2-1", "B2", "0", 20, 0, { ambiguous: true, status: 0 }),
    ];
    const r = joinVariantB(intents, finalB("2"));
    assert.equal(r.records[0]!.lostLower, 0);
    assert.equal(r.records[0]!.lostUpper, 0);
    assert.equal(r.verdict, "PASS");
  });

  it("variant B: a timed-out increment that did not apply raises the upper bound only", () => {
    const intents = [
      b("B1-1", "B1", "0", 0, 10),
      b("B2-1", "B2", "0", 20, 0, { ambiguous: true, status: 0 }),
    ];
    const r = joinVariantB(intents, finalB("1"));
    assert.equal(r.records[0]!.lostLower, 0);
    assert.equal(r.records[0]!.lostUpper, 1);
    assert.equal(r.verdict, "PASS");
  });

  it("a duplicate intent id is counted once and the first copy is used", () => {
    const first = a("A1-1", "employees", "1000001", 10);
    const second = a("A1-1", "employees", "9999999", 50);
    const { kept, duplicates } = dedupeIntents([first, second]);
    assert.equal(duplicates, 1);
    assert.equal(kept.length, 1);
    assert.equal(kept[0]!.value, "1000001");
  });

  it("two acknowledged attempts with the same ackMs keep the verdict and are reported only", () => {
    const intents = [b("B1-1", "B1", "0", 0, 10), b("B2-1", "B2", "1", 5, 10)];
    const r = joinVariantB(intents, finalB("2"));
    assert.equal(r.verdict, "PASS");
    assert.equal(r.overlapWindows, 1);
  });

  it("an infeasible final value (observed above acked plus ambiguous) is a TEST BUG", () => {
    const intents = [b("B1-1", "B1", "0", 0, 10), b("B2-1", "B2", "1", 20, 30)];
    assert.throws(() => joinVariantB(intents, finalB("4")), /TEST BUG: infeasible/);
  });

  it("a stage with no acknowledged increment is INCONCLUSIVE and its loss rate is 0", () => {
    const intents = [b("B1-1", "B1", "0", 0, 10, { ambiguous: true, status: 0 })];
    const r = joinVariantB(intents, finalB("0"));
    assert.equal(r.stageLoss[0]!.verdict, "INCONCLUSIVE");
    assert.equal(r.stageLoss[0]!.lossRate, 0);
    assert.equal(countOverlapWindows(intents), 0);
    assert.equal(lossRate(0, 0), 0);
  });

  it("the loss rate is lostLower over acked", () => {
    assert.equal(lossRate(1, 4), 0.25);
  });
});
