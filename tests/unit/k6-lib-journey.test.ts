import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runJourney } from "../../k6/lib/pure/journey.js";

function fakeDeps() {
  const checks: Array<[string, boolean]> = [];
  const sleeps: number[] = [];
  let t = 0;
  return {
    checks,
    sleeps,
    deps: {
      check: (name: string, ok: boolean) => checks.push([name, ok]),
      sleep: (sec: number) => sleeps.push(sec),
      now: () => (t += 5),
    },
  };
}

describe("k6 lib journey", () => {
  it("runs every step when all are ok and checks each one", () => {
    const f = fakeDeps();
    const out = runJourney({
      steps: [
        { name: "a", run: () => ({ ok: true }) },
        { name: "b", run: () => ({ ok: true }) },
      ],
      deps: f.deps,
    });
    assert.equal(out.completed, true);
    assert.equal(out.failedStep, null);
    assert.equal(out.steps.length, 2);
    assert.deepEqual(f.checks, [
      ["a", true],
      ["b", true],
    ]);
  });

  it("stops at the first failure and never runs later steps", () => {
    const f = fakeDeps();
    let ranC = false;
    const out = runJourney({
      steps: [
        { name: "a", run: () => ({ ok: true }) },
        { name: "b", run: () => ({ ok: false }) },
        {
          name: "c",
          run: () => {
            ranC = true;
            return { ok: true };
          },
        },
      ],
      deps: f.deps,
    });
    assert.equal(out.completed, false);
    assert.equal(out.failedStep, "b");
    assert.equal(out.steps.length, 2);
    assert.equal(ranC, false);
    assert.deepEqual(f.checks.at(-1), ["b", false]);
  });

  it("sleeps only after an ok step", () => {
    const f = fakeDeps();
    runJourney({
      steps: [
        { name: "a", run: () => ({ ok: true }), thinkSec: 1 },
        { name: "b", run: () => ({ ok: false }), thinkSec: 2 },
      ],
      deps: f.deps,
    });
    assert.deepEqual(f.sleeps, [1]);
  });

  it("checks every step, including the failed one", () => {
    const f = fakeDeps();
    runJourney({
      steps: [
        { name: "x", run: () => ({ ok: true }) },
        { name: "y", run: () => ({ ok: false }) },
      ],
      deps: f.deps,
    });
    assert.deepEqual(f.checks, [
      ["x", true],
      ["y", false],
    ]);
  });

  it("merges step data into the state the next step reads", () => {
    const f = fakeDeps();
    const out = runJourney({
      steps: [
        { name: "create", run: () => ({ ok: true, data: { cartId: "c1" } }) },
        {
          name: "complete",
          run: (state) => ({ ok: state.cartId === "c1" }),
        },
      ],
      deps: f.deps,
    });
    assert.equal(out.completed, true);
    assert.equal(out.state.cartId, "c1");
  });
  it("a step with stop: true ends the journey as completed and skips the rest", () => {
    const f = fakeDeps();
    let ran = false;
    const out = runJourney({
      steps: [
        { name: "a", run: () => ({ ok: true, stop: true }) },
        {
          name: "b",
          run: () => {
            ran = true;
            return { ok: true };
          },
        },
      ],
      deps: f.deps,
    });
    assert.equal(out.completed, true);
    assert.equal(out.failedStep, null);
    assert.equal(ran, false);
    assert.equal(out.steps.length, 1);
    assert.deepEqual(f.checks, [["a", true]]);
  });
});
