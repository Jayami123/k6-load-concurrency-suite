import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateSpike, type SpikeCounts, type SpikeInput } from "../../src/load/spike/contract.ts";
import { limitedLineMismatch, unfinishedFinding } from "../../src/load/spike/limited.ts";
import type { Window } from "../../src/load/recovery.ts";

const T0 = 1_000_000;
const NONE = { ok: 0, r4xx: 0, r429: 0, r5xx: 0, transport: 0 };

function win(
  index: number,
  p95Ms: number | undefined,
  requests = 100,
  r5xx = 0,
  transport = 0,
): Window {
  return {
    index,
    fromMs: T0 + index * 10_000,
    toMs: T0 + (index + 1) * 10_000,
    requests,
    p95Ms,
    status: { ...NONE, ok: requests - r5xx - transport, r5xx, transport },
  };
}

const COUNTS: SpikeCounts = {
  ok: 1000,
  refusedWithBody: 0,
  refusedNoBody: 0,
  limited: 0,
  limitedNoBody: 0,
  serverError: 0,
  transport: 0,
  droppedIterations: 0,
};

function input(
  over: Omit<Partial<SpikeInput>, "counts"> & { counts?: Partial<SpikeCounts> } = {},
): SpikeInput {
  const { counts, ...rest } = over;
  return {
    product: "cal",
    windows: [win(0, 100), win(1, 100), win(2, 100), win(3, 100)],
    preSpike: [win(0, 900), win(1, 120), win(2, 110)],
    spikeEndMs: T0 + 20_000,
    counts: { ...COUNTS, ...counts },
    ...rest,
  };
}

describe("spike contract", () => {
  it("a clean characterisation passes and reports the recovery", () => {
    const r = evaluateSpike(input());
    assert.equal(r.label, "characterisation");
    assert.equal(r.verdict, "PASS");
    assert.equal(r.recoverySec, 20);
  });

  it("a 5xx storm is a product bug (suspected) and never a final label", () => {
    const r = evaluateSpike(input({ windows: [win(0, 100), win(1, 100, 100, 6)] }));
    assert.equal(r.verdict, "PRODUCT BUG (SUSPECTED)");
    assert.equal(r.checks.find((c) => c.name === "no 5xx storm")?.ok, false);
  });

  it("a refusal without a body fails the Documenso contract", () => {
    const r = evaluateSpike(
      input({
        product: "documenso",
        counts: { limited: 12, refusedNoBody: 1, limitedByRoute: { "/api/trpc": 12 } },
      }),
    );
    assert.equal(r.label, "limiter contract");
    assert.equal(r.verdict, "PRODUCT BUG (SUSPECTED)");
    assert.equal(r.checks.find((c) => c.name === "no refusal without a body")?.ok, false);
  });

  it("Documenso needs at least 10 429s, else the run is INVALID no_refusals", () => {
    const r = evaluateSpike(
      input({ product: "documenso", counts: { limited: 9, limitedByRoute: { "/api/trpc": 9 } } }),
    );
    assert.equal(r.verdict, "INVALID");
    assert.equal(r.invalidReason, "no_refusals");
  });

  it("a 429 on a route the limiter does not cover is a finding", () => {
    const r = evaluateSpike(
      input({
        product: "documenso",
        counts: { limited: 12, limitedByRoute: { "/api/trpc": 10, "/api/v2": 2 } },
      }),
    );
    assert.equal(r.checks.find((c) => c.name === "429 only on covered routes")?.ok, false);
  });

  it("dropped iterations make the run INVALID", () => {
    const r = evaluateSpike(input({ counts: { droppedIterations: 14 } }));
    assert.equal(r.verdict, "INVALID");
    assert.equal(r.invalidReason, "dropped_iterations");
  });

  it("the Documenso unfinished-document rule is exact, and a lost limited line is a TEST BUG", () => {
    const exempt = {
      intent: 1,
      outcome: "fail" as const,
      limited: true,
      envelopes: [{ status: "PENDING" }],
    };
    assert.equal(unfinishedFinding(exempt), null);
    assert.notEqual(unfinishedFinding({ ...exempt, outcome: "ok" }), null);
    assert.notEqual(unfinishedFinding({ ...exempt, limited: false }), null);
    assert.notEqual(unfinishedFinding({ ...exempt, envelopes: [] }), null);
    assert.notEqual(
      unfinishedFinding({ ...exempt, envelopes: [{ status: "PENDING" }, { status: "PENDING" }] }),
      null,
    );
    assert.equal(limitedLineMismatch(10, 10), null);
    assert.match(limitedLineMismatch(9, 10) ?? "", /TEST BUG/);
  });
});
