import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatRaceTable,
  parseRaceFile,
  perTrialTime,
  raceSummaryRow,
  trialNumbers,
} from "../../src/ci/race-table.ts";

// Fake values only. The shape follows the real histograms in the p6-phase1 release zips.
function request(startedAtMs: number, endedAtMs: number) {
  return { index: 0, status: 200, bodySummary: "200: {}", startedAtMs, endedAtMs };
}

function trial(n: number, oracle: Record<string, number | string>) {
  return {
    trial: n,
    ok: true,
    statuses: [200],
    statusCounts: { "200": 1 },
    dispatchSpreadMs: 1,
    oracle,
    invariantViolations: [],
    requests: [request(1000, 2500)],
  };
}

function histogram(caseId: string, trials: unknown[], extra: Record<string, unknown> = {}) {
  return {
    caseId,
    title: "fake",
    product: "cal",
    commitSha: "0".repeat(40),
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:01:00.000Z",
    trials: trials.length,
    concurrency: 2,
    statusCounts: {},
    perTrial: trials,
    oracle: {},
    dispatchSpreadMs: { min: 0, max: 0, mean: 0 },
    invariantViolations: [],
    verdict: "pass",
    ...extra,
  };
}

const rowOf = (h: Record<string, unknown>) => raceSummaryRow("fake.json", h);

describe("per-trial time (README definition)", () => {
  it("is (finishedAt - startedAt) / trials, to 2 decimals", () => {
    // 60 s over 50 trials = 1.20 s
    assert.equal(
      perTrialTime({
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:01:00.000Z",
        trials: 50,
      }),
      "1.20 s",
    );
  });

  it("is n/a when startedAt or finishedAt is missing or not a date", () => {
    assert.equal(perTrialTime({ finishedAt: "2026-01-01T00:01:00.000Z", trials: 50 }), "n/a");
    assert.equal(
      perTrialTime({ startedAt: "2026-01-01T00:00:00.000Z", finishedAt: "soon", trials: 50 }),
      "n/a",
    );
  });

  it("is n/a when trials is 0, missing or negative", () => {
    const window = {
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:01:00.000Z",
    };
    assert.equal(perTrialTime({ ...window, trials: 0 }), "n/a");
    assert.equal(perTrialTime({ ...window }), "n/a");
    assert.equal(perTrialTime({ ...window, trials: -3 }), "n/a");
  });
});

describe("race rows", () => {
  const twoTrials = [trial(1, {}), trial(2, {})];

  it("CAL-003 double-booked wording and key counts", () => {
    const row = rowOf(
      histogram("P6-CAL-RACE-003", twoTrials, {
        oracle: { trialsDoubleBooked: 2, trialsClean: 0 },
      }),
    );
    assert.equal(row.keyCounts, "double-booked trials 2; clean 0");
    assert.equal(
      row.outcome,
      "Reproduces P6-OBS-CAL-002: overlapping bookings both accepted in 2 of 2 trials",
    );
  });

  it("CAL-003 clean wording", () => {
    const row = rowOf(
      histogram("P6-CAL-RACE-003", twoTrials, {
        oracle: { trialsDoubleBooked: 0, trialsClean: 2 },
      }),
    );
    assert.equal(
      row.outcome,
      "Did not reproduce: no overlapping pair accepted together in 2 trials",
    );
  });

  it("identical slot: one ACCEPTED per slot, and 400 losers reproduce P6-OBS-CAL-001", () => {
    const losers = { acceptedCount: 1, "loser_db-unique-redacted": 19, loser_unexpected: 0 };
    const row = rowOf(histogram("P6-CAL-RACE-001", [trial(1, losers), trial(2, losers)]));
    assert.equal(
      row.outcome,
      "One ACCEPTED per slot in 2 trials; Reproduces P6-OBS-CAL-001: 38 losers got 400 not 409",
    );
  });

  it("identical-slot family uses exact ids: extra-same-attendee gets the Cal rule", () => {
    const row = rowOf(
      histogram("extra-same-attendee", [
        trial(1, { acceptedCount: 2, "loser_db-unique-redacted": 0, loser_unexpected: 0 }),
        trial(2, { acceptedCount: 1, "loser_db-unique-redacted": 0, loser_unexpected: 0 }),
      ]),
    );
    assert.equal(row.keyCounts, "double-accepted trials 1; non-409 losers 0");
  });

  it("Medusa: one accepted-per-trial value is shown as a single number", () => {
    const row = rowOf(
      histogram("P6-MED-RACE-001", [
        trial(1, { httpWinnerCount: 5, available: 0 }),
        trial(2, { httpWinnerCount: 5, available: 0 }),
      ]),
    );
    assert.equal(row.keyCounts, "accepted per trial 5; oversold trials 0");
    assert.equal(row.outcome, "No oversell in 2 trials");
  });

  it("Medusa: differing counts show a min-max range and count oversold trials", () => {
    const row = rowOf(
      histogram("P6-MED-RACE-001", [
        trial(1, { httpWinnerCount: 2, available: -1 }),
        trial(2, { httpWinnerCount: 4, available: 0 }),
      ]),
    );
    assert.equal(row.keyCounts, "accepted per trial 2-4; oversold trials 1");
    assert.equal(row.outcome, "Oversold in 1 of 2 trials (not a tracked bug yet)");
  });

  it("Documenso double seal reproduces P6-OBS-DOC-002", () => {
    const row = rowOf(
      histogram("P6-DOC-RACE-001", twoTrials, {
        oracle: { trialsDoubleSeal: 2 },
        invariantViolations: ["x"],
      }),
    );
    assert.equal(row.keyCounts, "double-sealed trials 2; invariant violations 1");
    assert.equal(row.outcome, "Reproduces P6-OBS-DOC-002: sealed twice in 2 of 2 trials");
  });

  it("unknown case id uses the verdict only, key counts n/a", () => {
    const row = rowOf(histogram("framework-self-test", [], { verdict: "pass" }));
    assert.equal(row.keyCounts, "n/a");
    assert.equal(row.outcome, "Passed");
  });

  it("missing per-trial fields render n/a and do not throw", () => {
    const row = rowOf(histogram("P6-CAL-RACE-001", [{ trial: 1, ok: true, oracle: {} }]));
    assert.equal(row.keyCounts, "n/a");
    assert.equal(row.outcome, "n/a");
  });

  it("trialNumbers returns undefined when any trial lacks the key", () => {
    assert.equal(trialNumbers([{ oracle: { a: 1 } }, { oracle: {} }], "a"), undefined);
    assert.deepEqual(trialNumbers([{ oracle: { a: 1 } }, { oracle: { a: 2 } }], "a"), [1, 2]);
  });
});

describe("parsing and formatting", () => {
  it("malformed files throw with the file name", () => {
    assert.throws(
      () => parseRaceFile([], "a.json"),
      /a\.json: race histogram root must be an object/,
    );
    assert.throws(() => parseRaceFile({}, "b.json"), /b\.json: caseId must be a non-empty string/);
    assert.throws(
      () => parseRaceFile({ caseId: "x", perTrial: "no" }, "c.json"),
      /c\.json: perTrial must be an array/,
    );
  });

  it("empty input prints the no-histograms line", () => {
    assert.equal(
      formatRaceTable([]),
      "## Race results\n\nNo race histograms were written by this job.\n",
    );
  });

  it("escapes a pipe in a cell", () => {
    const md = formatRaceTable([
      {
        caseId: "x",
        trials: "1",
        verdict: "pass",
        keyCounts: "n/a",
        perTrialTime: "n/a",
        outcome: "a | b",
      },
    ]);
    assert.ok(md.includes("a \\| b"));
  });
});
