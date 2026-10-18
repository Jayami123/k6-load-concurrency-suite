import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  medusaBaseUrlFromEnv,
  medusaDatabaseUrlFromEnv,
  raceMaxSpreadMsFromEnv,
  raceTrialsFromEnv,
} from "../../src/races/env.ts";

describe("env", () => {
  it("defaults RACE_TRIALS to 5 when unset", () => {
    assert.equal(raceTrialsFromEnv({}), 5);
  });

  it("parses RACE_TRIALS=3", () => {
    assert.equal(raceTrialsFromEnv({ RACE_TRIALS: "3" }), 3);
  });

  it("rejects invalid RACE_TRIALS", () => {
    for (const raw of ["0", "-1", "abc"]) {
      assert.throws(() => raceTrialsFromEnv({ RACE_TRIALS: raw }), /TEST BUG/);
    }
  });

  it("defaults RACE_MAX_SPREAD_MS to 5 when unset", () => {
    assert.equal(raceMaxSpreadMsFromEnv({}), 5);
  });

  it("parses RACE_MAX_SPREAD_MS=10", () => {
    assert.equal(raceMaxSpreadMsFromEnv({ RACE_MAX_SPREAD_MS: "10" }), 10);
  });

  it("rejects invalid RACE_MAX_SPREAD_MS", () => {
    for (const raw of ["0", "-1", "abc"]) {
      assert.throws(() => raceMaxSpreadMsFromEnv({ RACE_MAX_SPREAD_MS: raw }), /TEST BUG/);
    }
  });

  it("medusa base URL fallback strips trailing slash", () => {
    assert.equal(medusaBaseUrlFromEnv({}), "http://127.0.0.1:9000");
    assert.equal(
      medusaBaseUrlFromEnv({ MEDUSA_BASE_URL: "http://127.0.0.1:9000/" }),
      "http://127.0.0.1:9000",
    );
  });

  it("database URL fallback order", () => {
    assert.equal(
      medusaDatabaseUrlFromEnv({ P6_MEDUSA_DATABASE_URL: "postgres://p6" }),
      "postgres://p6",
    );
    assert.equal(
      medusaDatabaseUrlFromEnv({ MEDUSA_DB_URL: "postgres://harness" }),
      "postgres://harness",
    );
    assert.equal(medusaDatabaseUrlFromEnv({}), "postgres://medusa:medusa@127.0.0.1:5433/medusa");
    assert.equal(
      medusaDatabaseUrlFromEnv({
        P6_MEDUSA_DATABASE_URL: "postgres://p6",
        MEDUSA_DB_URL: "postgres://harness",
      }),
      "postgres://p6",
    );
  });
});
