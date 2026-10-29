import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aaFlagsVerdict, medusaTolerances, type AaArm } from "../../src/load/tier-aa/verdict.ts";

const arm = (
  state: "off" | "on",
  p50Ms: number,
  p95Ms = 100,
  requestsPerSec = 50,
  valid = true,
): AaArm => ({ state, valid, values: { p50Ms, p95Ms, requestsPerSec } });

const TOL = { p50Ms: 0.5, p95Ms: 0.1, requestsPerSec: 0.1 };

describe("flags-on versus flags-off A/A verdict", () => {
  it("takes the median of each state and the pooled median", () => {
    const arms = [
      arm("off", 10),
      arm("off", 12),
      arm("off", 14),
      arm("on", 11),
      arm("on", 13),
      arm("on", 15),
    ];
    const { metrics } = aaFlagsVerdict(arms, TOL);
    assert.equal(metrics.p50Ms.medOff, 12);
    assert.equal(metrics.p50Ms.medOn, 13);
    assert.equal(metrics.p50Ms.pooled, 12.5);
    assert.equal(metrics.p50Ms.relDiff, 1 / 12.5);
  });

  it("PASSes when every relDiff is within its tolerance", () => {
    const arms = [
      arm("off", 100, 100, 50),
      arm("off", 101, 100, 50),
      arm("off", 99, 100, 50),
      arm("on", 100, 101, 50),
      arm("on", 101, 100, 50),
      arm("on", 100, 100, 50),
    ];
    assert.equal(aaFlagsVerdict(arms, TOL).verdict, "PASS");
  });

  it("FAILs and names the metric that breaches", () => {
    const arms = [
      arm("off", 100, 100),
      arm("off", 100, 100),
      arm("off", 100, 100),
      arm("on", 100, 150),
      arm("on", 100, 150),
      arm("on", 100, 150),
    ];
    const { verdict, metrics } = aaFlagsVerdict(arms, TOL);
    assert.equal(verdict, "FAIL");
    assert.equal(metrics.p95Ms.verdict, "FAIL");
    assert.equal(metrics.p50Ms.verdict, "PASS");
  });

  it("is INCONCLUSIVE below three valid arms per state", () => {
    const arms = [arm("off", 100), arm("off", 100), arm("on", 100), arm("on", 100), arm("on", 100)];
    assert.equal(aaFlagsVerdict(arms, TOL).verdict, "INCONCLUSIVE");
  });

  it("uses the 0.1 floor for p95Ms and requestsPerSec", () => {
    const near = [
      arm("off", 100, 100, 50),
      arm("off", 100, 100, 50),
      arm("off", 100, 100, 50),
      arm("on", 100, 105, 50),
      arm("on", 100, 105, 50),
      arm("on", 100, 105, 50),
    ];
    const far = near.map((a) => ({
      ...a,
      values: { ...a.values, p95Ms: a.state === "on" ? 112 : 100 },
    }));
    const floor = { p50Ms: 0.5, p95Ms: 0.1, requestsPerSec: 0.1 };
    const ok = aaFlagsVerdict(near, floor);
    assert.equal(ok.metrics.p95Ms.tolerance, 0.1, "the stored tolerance is used, not a spread");
    assert.equal(ok.metrics.p95Ms.verdict, "PASS");
    assert.equal(aaFlagsVerdict(far, floor).metrics.p95Ms.verdict, "FAIL");
  });

  it("reads the medusa entries only", () => {
    const file = {
      products: {
        cal: {
          p50Ms: { tolerance: 0.9 },
          p95Ms: { tolerance: 0.9 },
          requestsPerSec: { tolerance: 0.9 },
        },
        medusa: {
          p50Ms: { tolerance: 0.4238 },
          p95Ms: { tolerance: 0.1 },
          requestsPerSec: { tolerance: 0.1 },
        },
      },
    };
    assert.deepEqual(medusaTolerances(file), { p50Ms: 0.4238, p95Ms: 0.1, requestsPerSec: 0.1 });
    const noMedusa = { products: { cal: file.products.cal } };
    assert.throws(() => medusaTolerances(noMedusa), /no medusa entry for p50Ms/);
  });
});
