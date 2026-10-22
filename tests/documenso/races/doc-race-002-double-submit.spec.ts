import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  documensoBaseUrlFromEnv,
  documensoDatabaseUrlFromEnv,
  inbucketBaseUrlFromEnv,
  webhookHostFromEnv,
} from "../../../src/documenso/env.ts";
import { runCompletionCase } from "../../../src/documenso/run-case.ts";
import { closePool, createReadOnlyPool } from "../../../src/oracles/pg.ts";
import { raceTrialsFromEnv } from "../../../src/races/env.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";

const CASE_ID = "P6-DOC-RACE-002";
const TITLE = "same recipient double submit, N=10";

test.describe("P6-DOC-RACE-002 same recipient double submit", () => {
  const trials = raceTrialsFromEnv();
  test.describe.configure({ timeout: 120_000 + trials * 20_000 });

  test(`${CASE_ID} ${TITLE}`, async () => {
    const pool = createReadOnlyPool(documensoDatabaseUrlFromEnv());
    try {
      const result = await runCompletionCase({
        baseUrl: documensoBaseUrlFromEnv(),
        inbucketUrl: inbucketBaseUrlFromEnv(),
        runPrefix: p6RunPrefix(),
        pool,
        webhookHost: webhookHostFromEnv(),
        caseId: CASE_ID,
        title: TITLE,
        mode: "same-recipient",
        trials,
      });
      // Setup and cleanup first, then the product contract (plan §8.4, D16).
      expect(result.testViolations, result.testViolations.join("; ")).toEqual([]);
      const raw = JSON.parse(await readFile(`results/races/${CASE_ID}.json`, "utf8"));
      expect(raw.trialsRequested).toBe(trials);
      expect(raw.concurrency).toBe(10);
      // Q1: exactly one SIGNED and nine ALREADY_SIGNED per trial, all HTTP 200; any 4xx or 5xx fails.
      expect(result.histogram.statusCounts).toEqual({ "200": 10 * trials });
      expect(result.histogram.oracle.signedResponses).toBe(trials);
      expect(result.histogram.oracle.alreadySignedResponses).toBe(9 * trials);
      expect(result.histogram.oracle.clientErrorResponses).toBe(0);
      expect(result.histogram.oracle.serverErrorResponses).toBe(0);
      expect(result.histogram.oracle.trialsSingleSeal).toBe(trials);
      expect(result.productViolations, result.productViolations.join(" | ")).toEqual([]);
      expect(result.histogram.verdict).toBe("pass");
    } finally {
      await closePool(pool);
    }
  });
});
