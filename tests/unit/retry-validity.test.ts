import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { judgeStorm } from "../../src/load/retry-validity.ts";

describe("retry validity: judgeStorm", () => {
  it("half of the first attempts timed out and every one was retried passes", () => {
    const j = judgeStorm({ intents: 10, firstTimeouts: 5, retries: 5 });
    assert.equal(j.ok, true);
    assert.equal(j.kind, undefined);
    assert.match(j.detail, /5 of 10 first attempts timed out/);
  });

  it("no first attempt timed out is a TEST BUG (no storm)", () => {
    const j = judgeStorm({ intents: 10, firstTimeouts: 0, retries: 0 });
    assert.equal(j.ok, false);
    assert.equal(j.kind, "TEST BUG");
    assert.match(j.detail, /no storm \(0 of 10 first attempts timed out/);
  });

  it("fewer retries than timed-out first attempts is a TEST BUG", () => {
    const j = judgeStorm({ intents: 10, firstTimeouts: 6, retries: 4 });
    assert.equal(j.ok, false);
    assert.equal(j.kind, "TEST BUG");
    assert.match(j.detail, /no storm \(6 of 10/);
  });
});
