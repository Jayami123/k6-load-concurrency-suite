import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dispatchSpreadMs, fireTogether, summariseBody } from "../../src/races/fire-together.ts";
import { raceMaxSpreadMsFromEnv } from "../../src/races/env.ts";

describe("dispatchSpreadMs", () => {
  it("returns max minus min", () => {
    assert.equal(dispatchSpreadMs([10, 10.2, 12]), 2);
  });

  it("flags sequential-style spreads", () => {
    const sequentialStarts = [0, 12.687, 15, 28];
    const spread = dispatchSpreadMs(sequentialStarts);
    assert.ok(spread >= raceMaxSpreadMsFromEnv());
  });
});

describe("summariseBody", () => {
  it("does not throw on HTML 5xx", () => {
    const s = summariseBody(500, "<html>nope");
    assert.match(s, /500/);
    assert.match(s, /nope/);
  });
});

describe("fireTogether", () => {
  it("warm does not call makeRequest", async () => {
    let makeCount = 0;
    let warmCount = 0;
    await fireTogether(
      4,
      async () => {
        makeCount += 1;
        return { status: 200, body: "OK" };
      },
      {
        warm: async () => {
          warmCount += 1;
        },
      },
    );
    assert.equal(makeCount, 4);
    assert.equal(warmCount, 4);
  });
});
