import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  documensoBaseUrlFromEnv,
  documensoDatabaseUrlFromEnv,
  inbucketBaseUrlFromEnv,
  webhookHostFromEnv,
} from "../../../src/documenso/env.ts";
import { runCompletionCase } from "../../../src/documenso/run-case.ts";
import { createReadOnlyPool, closePool } from "../../../src/oracles/pg.ts";
import { raceTrialsFromEnv } from "../../../src/races/env.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";

const CASE_ID = "P6-DOC-RACE-001";
const TITLE = "two last recipients complete in parallel";

function caseInput(extra: {
  caseId: string;
  title: string;
  mode: "last-recipients" | "sequential-control";
  trials: number;
}) {
  return {
    baseUrl: documensoBaseUrlFromEnv(),
    inbucketUrl: inbucketBaseUrlFromEnv(),
    runPrefix: p6RunPrefix(),
    pool: createReadOnlyPool(documensoDatabaseUrlFromEnv()),
    webhookHost: webhookHostFromEnv(),
    ...extra,
  };
}

test.describe("P6-DOC-RACE-001 two last recipients", () => {
  const trials = raceTrialsFromEnv();
  test.describe.configure({ timeout: 120_000 + trials * 20_000 });

  test(`${CASE_ID} ${TITLE}`, async () => {
    const input = caseInput({ caseId: CASE_ID, title: TITLE, mode: "last-recipients", trials });
    try {
      const result = await runCompletionCase(input);
      test.info().annotations.push({
        type: "issue",
        description: `P6-OBS-DOC-002: double seal in ${result.doubleSealTrials}/${trials} trials`,
      });
      // Setup, contract, spread, cleanup and leak come first. They are not expected to fail (plan §10).
      expect(result.testViolations, result.testViolations.join("; ")).toEqual([]);
      const raw = JSON.parse(await readFile(`results/races/${CASE_ID}.json`, "utf8"));
      expect(raw.trials).toBe(trials);
      expect(raw.concurrency).toBe(2);
      // Setup for the product assertion (Q2): both legs answered 200 SIGNED and the envelope is COMPLETED.
      expect(
        result.histogram.oracle.signedResponses,
        "setup: both legs must answer 200 SIGNED",
      ).toBe(2 * trials);
      expect(result.histogram.oracle.clientErrorResponses).toBe(0);
      expect(result.histogram.oracle.serverErrorResponses).toBe(0);
      expect(
        result.histogram.oracle.envelopeCompletedTrials,
        "setup: envelope must be COMPLETED in every trial",
      ).toBe(trials);
      // PRODUCT BUG P6-OBS-DOC-002 (plan §2.8, §2.10). Remove test.fail() and the expectation below in the
      // same PR that fixes the seal race; a passing run then fails on purpose.
      test.fail();
      expect(
        result.doubleSealTrials,
        `PRODUCT BUG: P6-OBS-DOC-002 double seal in ${result.doubleSealTrials} of ${trials} trials`,
      ).toBe(0);
    } finally {
      await closePool(input.pool);
    }
  });
});

test.describe("Documenso extras (unmapped)", () => {
  const trials = Math.min(raceTrialsFromEnv(), 5);
  test.describe.configure({ timeout: 120_000 + trials * 20_000 });

  test("extra (unmapped): sequential control for P6-DOC-RACE-001", async () => {
    const input = caseInput({
      caseId: "extra-doc-sequential-control",
      title: "extra (unmapped): sequential control for P6-DOC-RACE-001",
      mode: "sequential-control",
      trials,
    });
    try {
      const result = await runCompletionCase(input);
      // A control violation is labelled TEST BUG (control) by construction, so the whole list must be empty.
      expect(
        result.histogram.invariantViolations,
        result.histogram.invariantViolations.join("; "),
      ).toEqual([]);
      expect(result.histogram.verdict).toBe("pass");
    } finally {
      await closePool(input.pool);
    }
  });
});
