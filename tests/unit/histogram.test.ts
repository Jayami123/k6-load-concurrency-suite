import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { createHistogram, histogramPath, writeHistogram } from "../../src/races/histogram.ts";
import type { RaceHistogram } from "../../src/races/types.ts";

describe("createHistogram", () => {
  it("returns a complete RaceHistogram without assertions", () => {
    const h = createHistogram({
      caseId: "framework-self-test",
      title: "framework self-test (unmapped)",
      product: "framework",
      concurrency: 20,
      trials: 3,
    });
    const typed: RaceHistogram = h;
    assert.equal(typed.verdict, "fail");
    assert.deepEqual(typed.trials, []);
    assert.deepEqual(typed.attempts, []);
    assert.deepEqual(typed.warmup, []);
    assert.deepEqual(typed.invariantViolations, []);
    assert.deepEqual(typed.statusCounts, {});
    assert.deepEqual(typed.dispatchSpreadMs, { min: 0, max: 0, mean: 0 });
    assert.deepEqual(typed.invalidDispatchSpreadMs, { min: 0, max: 0, mean: 0 });
    assert.equal(typed.invalidTrials, 0);
    assert.equal(typed.reruns, 0);
    assert.equal(typed.trialsRequested, 3);
    assert.equal(typed.caseId, "framework-self-test");
    assert.ok(typed.startedAt.length > 0);
    assert.equal(typed.finishedAt, "");
  });
});

describe("writeHistogram", () => {
  it("writes verdict fail on simulated failure", async () => {
    const dir = await mkdtemp(join(tmpdir(), "p6-hist-"));
    const prev = process.cwd();
    process.chdir(dir);
    try {
      const h = createHistogram({
        caseId: "fail-case",
        title: "t",
        product: "framework",
        concurrency: 1,
        trials: 1,
      });
      h.verdict = "fail";
      h.invariantViolations.push("simulated");
      await writeHistogram(h);
      const raw = JSON.parse(await readFile(histogramPath("fail-case"), "utf8"));
      assert.equal(raw.verdict, "fail");
      assert.deepEqual(raw.invariantViolations, ["simulated"]);
    } finally {
      process.chdir(prev);
      await rm(dir, { recursive: true, force: true });
    }
  });
});
