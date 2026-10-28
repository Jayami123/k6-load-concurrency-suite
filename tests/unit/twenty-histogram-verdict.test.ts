import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { histogramPath } from "../../src/races/histogram.ts";
import { runTwentyTrials } from "../../src/twenty/run-case.ts";

const okAttempt = async () => ({
  requests: [],
  oracle: { companyRowsLeft: 0 },
});

async function inTempCwd<T>(fn: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "p6-tw-verdict-"));
  const prev = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(prev);
    await rm(dir, { recursive: true, force: true });
  }
}

describe("runTwentyTrials histogram verdict", () => {
  it("runTwentyTrials sets verdict pass when every trial is ok and invariantViolations is empty", async () => {
    await inTempCwd(async () => {
      const { histogram, trials } = await runTwentyTrials({
        caseId: "P6-TW-VERDICT-PASS",
        title: "verdict pass fixture",
        concurrency: 1,
        attempt: okAttempt,
      });
      assert.ok(trials.every((t) => t.ok));
      assert.equal(histogram.invariantViolations.length, 0);
      assert.equal(histogram.verdict, "pass");
      const written = JSON.parse(await readFile(histogramPath("P6-TW-VERDICT-PASS"), "utf8")) as {
        verdict: string;
      };
      assert.equal(written.verdict, "pass");
    });
  });

  it("runTwentyTrials sets verdict fail when a trial throws", async () => {
    await inTempCwd(async () => {
      const { histogram, trials } = await runTwentyTrials({
        caseId: "P6-TW-VERDICT-FAIL",
        title: "verdict fail fixture",
        concurrency: 1,
        attempt: async (trial) => {
          if (trial === 0) return okAttempt();
          throw new Error("simulated trial throw");
        },
      });
      assert.ok(trials.some((t) => !t.ok));
      assert.equal(histogram.verdict, "fail");
      const written = JSON.parse(await readFile(histogramPath("P6-TW-VERDICT-FAIL"), "utf8")) as {
        verdict: string;
      };
      assert.equal(written.verdict, "fail");
    });
  });
});
