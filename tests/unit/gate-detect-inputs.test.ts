import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffBaseOf, hasLabel, parseLabelNames, ZERO_SHA } from "../../src/load/gate/triggers.ts";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

describe("gate trigger inputs from the event", () => {
  it("reads the labels of a push (the string null) and of a pull request with no labels as no labels", () => {
    assert.deepEqual(parseLabelNames("null"), []);
    assert.deepEqual(parseLabelNames(undefined), []);
    assert.deepEqual(parseLabelNames(""), []);
    assert.deepEqual(parseLabelNames("[]"), []);
    assert.equal(hasLabel(parseLabelNames("null"), "perf-gate"), false);
  });

  it("finds the perf-gate label on a pull request and refuses bad label input", () => {
    const names = parseLabelNames('[{"name":"perf-gate"},{"name":"docs"}]');
    assert.deepEqual(names, ["perf-gate", "docs"]);
    assert.equal(hasLabel(names, "perf-gate"), true);
    assert.throws(() => parseLabelNames("{not json"), /not valid JSON/);
    assert.throws(() => parseLabelNames('{"name":"perf-gate"}'), /must be a JSON array or null/);
    assert.throws(() => parseLabelNames('[{"id":1}]'), /needs a string name/);
  });

  it("diffs a push from the commit before it, falls back to HEAD~1 for a new branch, and diffs a pull request from its base", () => {
    assert.equal(diffBaseOf({ eventName: "push", beforeSha: SHA_A }), SHA_A);
    assert.equal(diffBaseOf({ eventName: "push", beforeSha: ZERO_SHA }), "HEAD~1");
    assert.equal(diffBaseOf({ eventName: "push", beforeSha: "" }), "HEAD~1");
    assert.equal(
      diffBaseOf({ eventName: "pull_request", prBaseSha: SHA_B, beforeSha: SHA_A }),
      SHA_B,
    );
    assert.throws(() => diffBaseOf({ eventName: "pull_request" }), /40-hex base sha/);
    assert.throws(() => diffBaseOf({ eventName: "push", beforeSha: "not-a-sha" }), /not 40-hex/);
  });
});
