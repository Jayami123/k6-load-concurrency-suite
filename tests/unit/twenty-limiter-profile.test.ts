import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  functional,
  isLimiterProfileName,
  limiterProfileEnv,
  productionLike,
} from "../../src/twenty/limiter-profile.ts";

const SIX_NAMES = [
  "API_RATE_LIMITING_SHORT_TTL_IN_MS",
  "API_RATE_LIMITING_SHORT_LIMIT",
  "API_RATE_LIMITING_LONG_TTL_IN_MS",
  "API_RATE_LIMITING_LONG_LIMIT",
  "APPLICATION_API_RATE_LIMITING_TTL_IN_MS",
  "APPLICATION_API_RATE_LIMITING_LIMIT",
];

describe("twenty limiter profile", () => {
  it("productionLike sets nothing (the image defaults)", () => {
    assert.deepEqual(limiterProfileEnv("productionLike"), {});
    assert.deepEqual(Object.keys(productionLike), []);
  });

  it("functional has exactly the six exact names", () => {
    assert.deepEqual(Object.keys(functional).sort(), [...SIX_NAMES].sort());
  });

  it("functional values equal the plan's §6.3 values", () => {
    assert.deepEqual(limiterProfileEnv("functional"), {
      API_RATE_LIMITING_SHORT_TTL_IN_MS: "1000",
      API_RATE_LIMITING_SHORT_LIMIT: "100",
      API_RATE_LIMITING_LONG_TTL_IN_MS: "60000",
      API_RATE_LIMITING_LONG_LIMIT: "3600",
      APPLICATION_API_RATE_LIMITING_TTL_IN_MS: "60000",
      APPLICATION_API_RATE_LIMITING_LIMIT: "500",
    });
  });

  it("an unknown name throws a TEST BUG and a name check rejects it", () => {
    assert.throws(
      () => limiterProfileEnv("fast" as "functional"),
      /TEST BUG: unknown limiter profile fast/,
    );
    assert.equal(isLimiterProfileName("fast"), false);
    assert.equal(isLimiterProfileName("functional"), true);
  });
});
