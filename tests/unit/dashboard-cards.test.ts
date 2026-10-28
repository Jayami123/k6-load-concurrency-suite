import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CARD_SPECS, computeCard, utcOf, type CardSpec } from "../../src/dashboard/cards.ts";
import type { VerdictInput } from "../../src/dashboard/site-model.ts";

const spec = (id: string): CardSpec => {
  const s = CARD_SPECS.find((c) => c.id === id);
  assert.ok(s, `card ${id} exists`);
  return s;
};

const run = (runId: string, caseId: string, outcome: string, validity = "VALID"): VerdictInput => ({
  runId,
  caseId,
  outcome,
  validity,
  reasons: validity === "VALID" ? [] : ["dropped iterations"],
});

describe("card state from the verdicts", () => {
  it("no run of the card's cases is PENDING, with the reason of the card", () => {
    const state = computeCard(spec("promo"), []);
    assert.equal(state.status, "PENDING");
    assert.equal(state.reason, spec("promo").pendingReason);
    assert.equal(state.runs.length, 0);
  });

  it("promo card caseIds are P6-MED-RACE-005 and P6-MED-RACE-012", () => {
    assert.deepEqual([...spec("promo").caseIds], ["P6-MED-RACE-005", "P6-MED-RACE-012"]);
  });

  it("cancel card caseIds include P6-MED-RACE-008 and P6-MED-RACE-009", () => {
    const ids = spec("cancel").caseIds;
    assert.ok(ids.includes("P6-MED-RACE-008"));
    assert.ok(ids.includes("P6-MED-RACE-009"));
  });

  it("invariants card knownFail lists P6-CAL-RACE-003 and P6-DOC-RACE-001 with joined obs ids", () => {
    const kf = spec("invariants").knownFail;
    assert.ok(kf);
    assert.deepEqual([...kf.caseIds].sort(), ["P6-CAL-RACE-003", "P6-DOC-RACE-001"]);
    assert.equal(kf.obs, "P6-OBS-CAL-002 / P6-OBS-DOC-002");
  });

  it("A/A card is no longer pending when VALID aa verdicts exist", () => {
    const state = computeCard(spec("aa-noise"), [
      run("20261026T175734Z-aa", "P6-CAL-LOAD-003", "PASS"),
      run("20261027T000001Z-bb", "P6-MED-LOAD-002", "PASS"),
    ]);
    assert.equal(state.status, "PASS");
    assert.equal(state.reason, "");
  });

  it("the under-load invariant card counts the Medusa load cases and marks the known leak", () => {
    const s = spec("invariants-load");
    assert.ok(s.caseIds.includes("P6-MED-LOAD-007"));
    assert.ok(s.caseIds.includes("P6-CAL-LOAD-002"));
    assert.equal(s.knownFail?.obs, "P6-OBS-MED-002");
    const state = computeCard(s, [run("20261027T145154Z-27ce6b31", "P6-MED-LOAD-007", "PASS")]);
    assert.equal(state.status, "PASS");
  });

  it("a VALID PASS run makes the card PASS and its run is listed", () => {
    const state = computeCard(spec("promo"), [
      run("20261026T175734Z-aa", "P6-MED-RACE-005", "PASS"),
    ]);
    assert.equal(state.status, "PASS");
    assert.equal(state.runs.length, 1);
  });

  it("only INVALID runs make the card INVALID, and they never decide a PASS", () => {
    const state = computeCard(spec("promo"), [
      run("20261026T175734Z-aa", "P6-MED-RACE-005", "PASS", "INVALID"),
    ]);
    assert.equal(state.status, "INVALID");
    assert.match(state.reason, /1 run\(s\), none VALID/);
  });

  it("a VALID FAIL on a known case is KNOWN FAIL with its observation id", () => {
    const state = computeCard(spec("cancel"), [
      run("20261026T175734Z-aa", "P6-MED-RACE-009", "FAIL"),
    ]);
    assert.equal(state.status, "KNOWN FAIL");
    assert.equal(state.obs, "P6-OBS-MED-002");
  });

  it("a VALID FAIL on a card with no known failure is FAIL", () => {
    const state = computeCard(spec("promo"), [
      run("20261026T175734Z-aa", "P6-MED-RACE-005", "FAIL"),
    ]);
    assert.equal(state.status, "FAIL");
    assert.equal(state.obs, "");
  });

  it("an INVALID FAIL never makes a card KNOWN FAIL or FAIL when a VALID PASS is present", () => {
    const state = computeCard(spec("cancel"), [
      run("20261026T175734Z-aa", "P6-MED-RACE-009", "FAIL", "INVALID"),
      run("20261026T180000Z-bb", "P6-MED-RACE-009", "PASS"),
    ]);
    assert.equal(state.status, "PASS");
  });

  it("the runs of a card are sorted by case then run, so the page is stable", () => {
    const state = computeCard(spec("invariants"), [
      run("20261026T180000Z-bb", "P6-DOC-RACE-001", "PASS"),
      run("20261026T170000Z-aa", "P6-CAL-RACE-001", "PASS"),
      run("20261026T160000Z-cc", "P6-CAL-RACE-001", "PASS"),
    ]);
    assert.deepEqual(
      state.runs.map((r) => `${r.caseId} ${r.runId}`),
      [
        "P6-CAL-RACE-001 20261026T160000Z-cc",
        "P6-CAL-RACE-001 20261026T170000Z-aa",
        "P6-DOC-RACE-001 20261026T180000Z-bb",
      ],
    );
  });

  it("changing one verdict changes the card state (nothing is typed in by hand)", () => {
    const before = computeCard(spec("cancel"), [
      run("20261026T175734Z-aa", "P6-MED-RACE-009", "PASS"),
    ]);
    const after = computeCard(spec("cancel"), [
      run("20261026T175734Z-aa", "P6-MED-RACE-009", "FAIL"),
    ]);
    assert.notEqual(before.status, after.status);
  });

  it("every card has a title, what it proves, and a pending reason with no task number", () => {
    for (const s of CARD_SPECS) {
      assert.ok(s.title.length > 0, s.id);
      assert.ok(s.proves.length > 0, s.id);
      assert.doesNotMatch(s.pendingReason, /Task \d+/, s.id);
      assert.doesNotMatch(`${s.title} ${s.proves}`, /capacity/i, s.id);
    }
  });
});

describe("utcOf", () => {
  it("reads the UTC time from a run id", () => {
    assert.equal(utcOf("20261026T175734Z-aa"), "2026-10-26 17:57:34 UTC");
  });

  it("shows time unknown for a run id without the timestamp prefix", () => {
    assert.equal(utcOf("run-without-time"), "time unknown");
  });
});
