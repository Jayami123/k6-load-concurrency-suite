import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertBothKept,
  assertExactlyOne,
  assertNameIsOneOf,
  assertNo5xx,
  assertOneSurvivor,
  assertReplayRefused,
  overlapped,
} from "../../src/twenty/invariants.ts";

describe("twenty race invariants", () => {
  it("assertNameIsOneOf passes for a candidate, throws for another value, and throws TEST BUG for null", () => {
    assertNameIsOneOf("A", ["A", "B"]);
    assert.throws(() => assertNameIsOneOf("C", ["A", "B"]), /P6-TW-RACE-001/);
    assert.throws(() => assertNameIsOneOf(null, ["A", "B"]), /TEST BUG/);
  });

  it("assertExactlyOne passes for 1 and names the count otherwise", () => {
    assertExactlyOne(1, "t");
    assert.throws(() => assertExactlyOne(10, "t"), /10 successes, expected exactly 1/);
  });

  it("assertBothKept passes when both values persist and throws on a lost update", () => {
    assertBothKept({ name: "X", employees: 3 }, { name: "X", employees: 3 });
    assert.throws(
      () => assertBothKept({ name: "X", employees: null }, { name: "X", employees: 3 }),
      /lost update/,
    );
  });

  it("assertReplayRefused passes on a GraphQL error and throws when the replay was accepted", () => {
    assertReplayRefused({ errors: [{ message: "Token is invalid" }] });
    assert.throws(() => assertReplayRefused({}), /replay was accepted/);
  });

  it("assertOneSurvivor passes for one live row and one survivor id, and throws otherwise", () => {
    assertOneSurvivor(1, ["s", "s"]);
    assert.throws(() => assertOneSurvivor(2, ["s", "s"]), /live rows/);
    assert.throws(() => assertOneSurvivor(1, ["s", "t"]), /survivor ids/);
  });

  it("assertNo5xx passes for 2xx and 4xx and throws for a 5xx or a missing response", () => {
    assertNo5xx([200, 409]);
    assert.throws(() => assertNo5xx([500]), /UNEXPECTED/);
    assert.throws(() => assertNo5xx([null]), /UNEXPECTED/);
  });

  it("overlapped is true only when the latest start is before the earliest end", () => {
    assert.equal(
      overlapped([
        { startedAtMs: 0, endedAtMs: 10 },
        { startedAtMs: 2, endedAtMs: 12 },
      ]),
      true,
    );
    assert.equal(
      overlapped([
        { startedAtMs: 0, endedAtMs: 1 },
        { startedAtMs: 5, endedAtMs: 6 },
      ]),
      false,
    );
    assert.equal(overlapped([{ startedAtMs: 0, endedAtMs: 10 }]), false);
  });
});
