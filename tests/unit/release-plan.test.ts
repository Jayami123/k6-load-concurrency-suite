import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePendingFile, planRelease } from "../../src/dashboard/release-plan.ts";

const assets = [
  { tag: "p6-phase4a", name: "p6-40290101719-evidence.zip" },
  { tag: "p6-phase3", name: "p6-40177412186-evidence.zip" },
];
const pending = [{ runId: "40242002499", reason: "baseline run, not in any release yet" }];

describe("release plan", () => {
  it("a cited run that is in a release is fetched from it, in any p6 release", () => {
    const plan = planRelease(["40290101719", "40177412186"], assets, []);
    assert.deepEqual(plan.fetch, [
      { runId: "40290101719", tag: "p6-phase4a", zip: "p6-40290101719-evidence.zip" },
      { runId: "40177412186", tag: "p6-phase3", zip: "p6-40177412186-evidence.zip" },
    ]);
    assert.deepEqual(plan.missing, []);
  });

  it("a cited run with no zip that is on the pending list passes and is shown as pending", () => {
    const plan = planRelease(["40242002499"], assets, pending);
    assert.deepEqual(plan.pending, pending);
    assert.deepEqual(plan.missing, []);
    assert.deepEqual(plan.fetch, []);
  });

  it("a cited run with no zip that is not pending is missing (the check fails)", () => {
    const plan = planRelease(["40242007346"], assets, pending);
    assert.deepEqual(plan.missing, ["40242007346"]);
    assert.deepEqual(plan.pending, []);
  });

  it("a run cited twice is planned once", () => {
    assert.equal(planRelease(["40290101719", "40290101719"], assets, []).fetch.length, 1);
  });

  it("the pending file needs schema 1, digit-only run ids and a reason for each", () => {
    assert.throws(
      () => parsePendingFile({ schema: 2, release: "p6-phase4", pending: [] }),
      /schema must be 1/,
    );
    assert.throws(
      () =>
        parsePendingFile({
          schema: 1,
          release: "p6-phase4",
          pending: [{ runId: "abc", reason: "x" }],
        }),
      /not digits only/,
    );
    assert.throws(
      () =>
        parsePendingFile({
          schema: 1,
          release: "p6-phase4",
          pending: [{ runId: "1", reason: " " }],
        }),
      /needs a reason/,
    );
  });
});
