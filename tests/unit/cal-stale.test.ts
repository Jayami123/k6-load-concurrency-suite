import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyStale, type StalePoll } from "../../src/load/cal/stale.ts";

const COMMIT = 1_000_000;
/** Polls every 2 s after commit, offered as given (30 polls = 60 s). */
const polls = (offered: Array<boolean | null>): StalePoll[] =>
  offered.map((o, i) => ({ tMs: COMMIT + (i + 1) * 2000, offered: o }));
const base = {
  contract: "never-offered-again" as const,
  commitMs: COMMIT,
  pollsExpected: 30,
  ttlMs: 2000,
  marginMs: 1000,
  secondAcceptedOnS: false,
};

describe("cal stale-read classifier", () => {
  it("passes sampled under never-offered-again when no poll after commit offers the slot", () => {
    const v = classifyStale({ ...base, polls: polls(Array(30).fill(false)) });
    assert.equal(v.verdict, "PASS (sampled, 2 s)");
    assert.equal(v.timeToDisappearMs, null);
    assert.equal(v.observation, "sampled-2s");
  });

  it("fails as a product bug when the slot is offered again after commit under never-offered-again", () => {
    const v = classifyStale({
      ...base,
      polls: polls([true, true, false, ...Array(27).fill(false)]),
    });
    assert.equal(v.verdict, "FAIL (PRODUCT BUG)");
    assert.equal(v.staleCount, 2);
    assert.equal(v.timeToDisappearMs, 6000);
  });

  it("allows an offer within ttl plus margin under bounded-staleness, and fails one beyond it", () => {
    const within = classifyStale({
      ...base,
      contract: "bounded-staleness",
      polls: polls([true, false, ...Array(28).fill(false)]),
    });
    assert.equal(within.verdict, "PASS (sampled, 2 s)");
    const beyond = classifyStale({
      ...base,
      contract: "bounded-staleness",
      polls: polls([false, false, false, false, true, ...Array(25).fill(false)]),
    });
    assert.equal(beyond.verdict, "FAIL (PRODUCT BUG)");
    assert.equal(beyond.staleCount, 1);
  });

  it("is TEST BUG for a missing or failed poll, so incomplete coverage never passes", () => {
    const missing = classifyStale({ ...base, polls: polls(Array(29).fill(false)) });
    assert.equal(missing.verdict, "TEST BUG");
    const failed = classifyStale({ ...base, polls: polls([null, ...Array(29).fill(false)]) });
    assert.equal(failed.verdict, "TEST BUG");
    assert.match(failed.reasons.join(" "), /a poll failed/);
  });

  it("fails as a product bug on a second ACCEPTED on the slot, even with clean polls", () => {
    const v = classifyStale({
      ...base,
      polls: polls(Array(30).fill(false)),
      secondAcceptedOnS: true,
    });
    assert.equal(v.verdict, "FAIL (PRODUCT BUG)");
    assert.match(v.reasons[0] ?? "", /second ACCEPTED/);
  });
});
