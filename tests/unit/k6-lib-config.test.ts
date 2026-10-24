import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseLoadConfig } from "../../k6/lib/pure/config.js";

describe("k6 lib config", () => {
  it("uses the file value when no environment value is set", () => {
    assert.equal(parseLoadConfig('{"rate": 40}', {}, [], { rate: "RATE" }).rate, 40);
  });

  it("throws on a missing required key", () => {
    assert.throws(() => parseLoadConfig("{}", {}, ["rate"]), /missing load config key rate/);
  });

  it("empty text gives an empty config", () => {
    assert.deepEqual(parseLoadConfig("", {}), {});
  });

  it("an environment value wins over the file value and a numeric one is parsed to a number", () => {
    const cfg = parseLoadConfig('{"rate": 10}', { RATE: "40" }, [], { rate: "RATE" });
    assert.equal(cfg.rate, 40);
    assert.equal(typeof cfg.rate, "number");
  });

  it("throws on a non-numeric environment value for a numeric key", () => {
    assert.throws(
      () => parseLoadConfig("{}", { RATE: "abc" }, [], { rate: "RATE" }),
      /load config RATE is not a number/,
    );
  });

  it("throws on a non-numeric file value for a numeric key, and normalises a numeric string", () => {
    assert.throws(() => parseLoadConfig('{"rate": "abc"}', {}), /rate is not a finite number/);
    assert.equal(parseLoadConfig('{"rate": "40"}', {}).rate, 40);
  });
});
