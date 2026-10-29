import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOUNDARY_GATE_CLOSED,
  checkBoundaryPremise,
  GATE_PREMISE_MISMATCH,
} from "../../src/load/products/twenty-reset-token.ts";
import { evaluateVerdict, EXIT_CODES } from "../../src/load/runner.ts";
import type { LoadCase, LoadContext } from "../../src/load/types.ts";
import { IMAGE_DEFAULT_RESET_LIFETIME_MS } from "../../src/twenty/window-oracle.ts";

const MINUTE = 60_000;

/** A token window that lives `lifetimeMs`. */
const windowOf = (lifetimeMs: number) => ({
  createdAtMs: 1_700_000_000_000,
  expiresAtMs: 1_700_000_000_000 + lifetimeMs,
});

/** A minimal run context: no k6 runs, no stage results, the reset-token case's own handles. */
function ctxFor(): LoadContext {
  return {
    caseDef: { id: "P6-TW-LOAD-011", runs: () => [] } as unknown as LoadCase,
    k6: [],
    results: {},
    invalid: [],
    handles: {},
  } as unknown as LoadContext;
}

describe("P6-TW-LOAD-011 boundary premise (in the case)", () => {
  it("runs the redemptions and is PASS-eligible when the premise matches and the gate is open", () => {
    const ctx = ctxFor();
    assert.equal(
      checkBoundaryPremise(ctx, [
        windowOf(IMAGE_DEFAULT_RESET_LIFETIME_MS),
        windowOf(IMAGE_DEFAULT_RESET_LIFETIME_MS),
      ]),
      true,
    );
    assert.deepEqual(ctx.invalid, []);
    assert.equal(ctx.notRun, undefined);
    assert.equal(evaluateVerdict(ctx).outcome, "PASS");
  });

  it("a closed gate is NOT RUN, never PASS: the premise mismatch makes it INVALID", () => {
    const ctx = ctxFor();
    assert.equal(checkBoundaryPremise(ctx, [windowOf(20 * MINUTE), windowOf(20 * MINUTE)]), false);
    assert.equal(ctx.handles.resetVerdict, "NOT RUN");
    assert.deepEqual(ctx.notRun, [BOUNDARY_GATE_CLOSED]);
    assert.equal(ctx.invalid.length, 1);
    assert.ok(ctx.invalid[0]!.startsWith(GATE_PREMISE_MISMATCH));
    const verdict = evaluateVerdict(ctx);
    assert.equal(verdict.outcome, "INVALID");
    assert.notEqual(verdict.outcome, "PASS");
    assert.ok(verdict.reasons.some((r) => r.startsWith(GATE_PREMISE_MISMATCH)));
  });

  it("an observed lifetime that disagrees with the recorded one is INVALID even when the gate is open", () => {
    const ctx = ctxFor();
    assert.equal(checkBoundaryPremise(ctx, [windowOf(10 * MINUTE)]), true);
    assert.ok(ctx.invalid[0]!.startsWith(GATE_PREMISE_MISMATCH));
    assert.equal(evaluateVerdict(ctx).outcome, "INVALID");
  });
});

describe("INCONCLUSIVE outcome (run-load verdict)", () => {
  it("a closed gate with nothing else wrong is INCONCLUSIVE, exit 0, never PASS", () => {
    const ctx = ctxFor();
    ctx.notRun = [BOUNDARY_GATE_CLOSED];
    const verdict = evaluateVerdict(ctx);
    assert.equal(verdict.outcome, "INCONCLUSIVE");
    assert.deepEqual(verdict.reasons, [BOUNDARY_GATE_CLOSED]);
    assert.equal(EXIT_CODES.INCONCLUSIVE, 0);
  });

  it("INVALID outranks INCONCLUSIVE", () => {
    const ctx = ctxFor();
    ctx.notRun = [BOUNDARY_GATE_CLOSED];
    ctx.invalid = ["gate premise mismatch: observed"];
    assert.equal(evaluateVerdict(ctx).outcome, "INVALID");
  });
});
