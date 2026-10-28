import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { CARD_SPECS, computeCard, type CardSpec } from "../../src/dashboard/cards.ts";
import { raceVerdictInputs, readRaceTallies } from "../../src/dashboard/races/read-tallies.ts";
import { renderRaceChart } from "../../src/dashboard/render/race-chart.ts";
import { walkVerdicts } from "../../src/dashboard/verdicts.ts";

const FIXTURES = fileURLToPath(new URL("../fixtures/dashboard/races", import.meta.url));
const PERF_RUNS = [
  "40465973379",
  "40469597860",
  "40498902575",
  "40524237209",
  "40526041971",
] as const;
const LOAD_009_RUNS = ["40498902575", "40524237209", "40526041971"] as const;

const spec = (id: string): CardSpec => {
  const s = CARD_SPECS.find((c) => c.id === id);
  assert.ok(s, `card ${id} exists`);
  return s;
};

const artefact = (runId: string): string => path.join(FIXTURES, runId);

describe("race tallies from p6-phase4 histograms", () => {
  it("CAL-RACE-001 tally 50/0, 51/0, 51/0, 50/0, 51/0 in run order", () => {
    const rows = PERF_RUNS.flatMap((id) => readRaceTallies(artefact(id), id))
      .filter((t) => t.caseId === "P6-CAL-RACE-001")
      .sort((a, b) => a.githubRunId.localeCompare(b.githubRunId));
    assert.deepEqual(
      rows.map((t) => [t.attempts, t.attemptsWithViolation]),
      [
        [50, 0],
        [51, 0],
        [51, 0],
        [50, 0],
        [51, 0],
      ],
    );
    assert.deepEqual(
      rows.map((t) => t.invalidAttempts),
      [0, 1, 1, 0, 1],
    );
    assert.deepEqual(
      rows.map((t) => t.githubRunId),
      [...PERF_RUNS],
    );
  });

  it("KNOWN FAIL when knownFail is P6-OBS-MED-002 even if outcome is PASS", () => {
    const verdicts = LOAD_009_RUNS.flatMap((id) =>
      walkVerdicts(artefact(id), id).map((w) => w.verdict),
    )
      .filter((v) => v.caseId === "P6-MED-LOAD-009")
      .sort((a, b) => a.githubRunId!.localeCompare(b.githubRunId!));
    assert.equal(verdicts.length, 3);
    assert.ok(verdicts.every((v) => v.outcome === "PASS"));
    assert.ok(verdicts.every((v) => v.knownFail === "P6-OBS-MED-002"));
    assert.deepEqual(
      verdicts.map((v) => v.leakedCanceledOrders),
      [4, 5, 6],
    );
    const state = computeCard(spec("invariants-load"), verdicts);
    assert.equal(state.status, "KNOWN FAIL");
    assert.equal(state.obs, "P6-OBS-MED-002");
  });

  it("Twenty card is PENDING on p6-phase4 histograms that still have the default fail", () => {
    const rows = readRaceTallies(artefact("40465973379"), "40465973379").filter((t) =>
      t.caseId.startsWith("P6-TW-RACE-"),
    );
    assert.ok(rows.length > 0, "p6-phase4 Twenty histograms are in the fixture");
    assert.ok(rows.every((t) => t.verdict === "fail" && t.attemptsWithViolation === 0));
    const inputs = raceVerdictInputs(rows);
    assert.equal(inputs.length, 0);
    const state = computeCard(spec("twenty"), inputs);
    assert.equal(state.status, "PENDING");
    assert.match(state.reason, /default fail/);
    assert.match(state.reason, /PR-T/);
  });

  it("Medusa pass with suspectedBug stays PASS on the promo card and counts 4, 0, 6, 0, 1 for -005", () => {
    const rows = PERF_RUNS.flatMap((id) => readRaceTallies(artefact(id), id))
      .filter((t) => t.caseId === "P6-MED-RACE-005")
      .sort((a, b) => a.githubRunId.localeCompare(b.githubRunId));
    assert.deepEqual(
      rows.map((t) => t.attemptsWithSuspectedBug),
      [4, 0, 6, 0, 1],
    );
    const inputs = raceVerdictInputs(rows);
    assert.ok(inputs.every((v) => v.outcome === "PASS"));
    assert.deepEqual(
      inputs.map((v) => v.suspectedBugCount),
      [4, 0, 6, 0, 1],
    );
    const state = computeCard(spec("promo"), inputs);
    assert.equal(state.status, "PASS");
    const svg = renderRaceChart(rows);
    for (const n of [4, 0, 6, 0, 1]) assert.match(svg, new RegExp(`\\b${n}\\b`));
  });

  it("MED-RACE-008 title two parallel cancels is not on the promo card", () => {
    const promo = spec("promo");
    assert.equal(promo.caseIds.includes("P6-MED-RACE-008"), false);
    assert.doesNotMatch(promo.title, /P6-MED-RACE-008/);
    const rows = readRaceTallies(artefact("40465973379"), "40465973379");
    const eight = rows.find((t) => t.caseId === "P6-MED-RACE-008");
    assert.ok(eight);
    assert.match(eight.title, /two parallel cancels/);
    const chart = renderRaceChart(rows.filter((t) => promo.caseIds.includes(t.caseId)));
    assert.doesNotMatch(chart, /two parallel cancels/);
    assert.doesNotMatch(chart, /P6-MED-RACE-008/);
  });

  it("race chart uses viewBox 0 0 720 200 and never loads a CDN", () => {
    const rows = PERF_RUNS.flatMap((id) => readRaceTallies(artefact(id), id)).filter(
      (t) => t.caseId === "P6-MED-RACE-005",
    );
    const chart = renderRaceChart(rows);
    assert.match(chart, /viewBox="0 0 720 200"/);
    assert.match(chart, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    assert.match(chart, /<table>/);
    assert.match(chart, /<th scope="col">Run<\/th>/);
    assert.match(chart, /<th scope="col">attempts<\/th>/);
    assert.doesNotMatch(chart, /<script/i);
    assert.doesNotMatch(chart, /<link[^>]+href=/i);
    assert.doesNotMatch(chart, /cdn\./i);
    const urls = chart.match(/https?:\/\/[^\s"<]+/g) ?? [];
    for (const url of urls) assert.equal(url, "http://www.w3.org/2000/svg");
    assert.equal(renderRaceChart([]), "");
  });
});
