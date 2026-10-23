import { expect, test } from "@playwright/test";
import { fireTogether } from "../../../src/races/fire-together.ts";
import { runTrials } from "../../../src/races/run-trials.ts";
import { createHistogram, writeHistogram } from "../../../src/races/histogram.ts";
import { createRerunRunner, spreadPolicyFromEnv } from "../../../src/races/rerun-on-spread.ts";
import { recordTrial } from "../../../src/races/trial-record.ts";
import { raceTrialsFromEnv } from "../../../src/races/env.ts";
import {
  closePool,
  createReadOnlyPool,
  selectRows,
  waitForStable,
} from "../../../src/oracles/pg.ts";
import {
  twentyBaseUrlFromEnv,
  twentyDatabaseUrlFromEnv,
  twentyEmailFromEnv,
  twentyPasswordFromEnv,
  twentySubdomainFromEnv,
  twentyWorkspaceNameFromEnv,
} from "../../../src/twenty/env.ts";
import { currentUserEmail, signInWorkspace } from "../../../src/twenty/auth.ts";
import { readOnlyWriteSqlstate, resolveWorkspaceSchema } from "../../../src/twenty/oracle.ts";

const CASE_ID = "twenty-self-test";
const CONCURRENCY = 20;
// /healthz is the harness health route (200). It is not on the API limiter (§3.4).
const HEALTH_PATH = "/healthz";

test.describe.configure({ timeout: 180_000 });

test("twenty self-test (unmapped): health burst, read-only oracle, session auth proof", async () => {
  const trials = raceTrialsFromEnv();
  const base = twentyBaseUrlFromEnv();
  const pool = createReadOnlyPool(twentyDatabaseUrlFromEnv());
  const histogram = createHistogram({
    caseId: CASE_ID,
    title: "twenty self-test (unmapped)",
    product: "twenty",
    concurrency: CONCURRENCY,
    trials,
  });
  let passed = false;

  try {
    // 1. Health burst. Every trial fires 20 parallel GET /healthz; trial 0 is the warm-up (no verdict, no count).
    const runner = createRerunRunner(spreadPolicyFromEnv(), trials);
    const burst = async (trial: number) => {
      const fired = await fireTogether(
        CONCURRENCY,
        async () => {
          const res = await fetch(`${base}${HEALTH_PATH}`);
          return { status: res.status, body: await res.text() };
        },
        {
          warm: async () => {
            const res = await fetch(`${base}${HEALTH_PATH}`);
            await res.text();
          },
        },
      );
      // Record first so the real statuses stay in the histogram even when the check below fails.
      return recordTrial(trial, fired, () => {
        for (const req of fired.requests) {
          if (req.status === 429) {
            throw new Error(
              `TEST BUG: GET ${HEALTH_PATH} returned 429 (rate limited): not a pass, not a race result`,
            );
          }
          if (req.status !== 200) {
            throw new Error(
              `UNEXPECTED: GET ${HEALTH_PATH} HTTP ${req.status} (no product label; see D14)`,
            );
          }
        }
      });
    };
    await runner.warmup(() => burst(0));
    const results = await runTrials(trials, (trial) => runner.runTrial(trial, () => burst(trial)));
    runner.applyTo(histogram);
    expect(
      results.every((t) => t.ok),
      "health burst: at least one trial is not ok",
    ).toBe(true);

    // 2. Oracle: the read-only pool answers, a write is refused with 25006, and the workspace schema resolves.
    const one = await waitForStable(() =>
      selectRows<{ ok: number | string }>(pool, "SELECT 1 AS ok"),
    );
    histogram.oracle.selectOne = Number(one[0]?.ok ?? NaN);
    expect(histogram.oracle.selectOne).toBe(1);

    const sqlstate = await readOnlyWriteSqlstate(pool);
    histogram.oracle.readOnlySqlstate = sqlstate;
    expect(sqlstate, `TEST BUG: expected SQLSTATE 25006, got ${sqlstate || "no code"}`).toBe(
      "25006",
    );

    const ws = await resolveWorkspaceSchema(pool, twentySubdomainFromEnv());
    histogram.oracle.workspaceSchema = ws.schema;

    // 3. Session auth proof: signIn, exchange, currentUser, one REST read. Never a 429 pass.
    const session = await signInWorkspace({
      baseUrl: base,
      email: twentyEmailFromEnv(),
      password: twentyPasswordFromEnv(),
      workspaceName: twentyWorkspaceNameFromEnv(),
    });
    const email = await currentUserEmail(base, session.authorizationHeader);
    histogram.oracle.currentUserMatches = email === twentyEmailFromEnv();
    expect(
      histogram.oracle.currentUserMatches,
      "TEST BUG: currentUser.email differs from TWENTY_EMAIL",
    ).toBe(true);

    const rest = await fetch(`${base}/rest/people?limit=1`, {
      headers: { authorization: session.authorizationHeader },
    });
    await rest.text();
    histogram.oracle.restPeopleStatus = rest.status;
    expect(rest.status, `TEST BUG: GET /rest/people HTTP ${rest.status} (429 is not a pass)`).toBe(
      200,
    );

    passed = results.every((t) => t.ok);
  } finally {
    // Counted here so every run reports its 429s, pass or fail (D5).
    histogram.oracle.rateLimited429 = histogram.statusCounts["429"] ?? 0;
    histogram.finishedAt = new Date().toISOString();
    histogram.verdict = passed ? "pass" : "fail";
    await writeHistogram(histogram);
    await closePool(pool);
  }
  // No cleanup or leak check: this test writes nothing (D9).
  expect(passed).toBe(true);
});
