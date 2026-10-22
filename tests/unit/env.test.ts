import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calBaseUrlFromEnv,
  calDatabaseUrlFromEnv,
  medusaAdminEmailFromEnv,
  medusaAdminPasswordFromEnv,
  medusaBaseUrlFromEnv,
  medusaDatabaseUrlFromEnv,
  raceMaxInvalidSharePctFromEnv,
  raceMaxSpreadMsFromEnv,
  raceMaxSpreadRerunsFromEnv,
  raceMinInvalidBudgetFromEnv,
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
    for (const raw of ["0", "-1", "abc", "3abc", "3.5", "1e3"]) {
      assert.throws(() => raceTrialsFromEnv({ RACE_TRIALS: raw }), /TEST BUG/);
    }
  });

  it("rejects fractional and exponent RACE_TRIALS", () => {
    assert.throws(() => raceTrialsFromEnv({ RACE_TRIALS: "3.5" }), /TEST BUG: RACE_TRIALS/);
    assert.throws(() => raceTrialsFromEnv({ RACE_TRIALS: "1e3" }), /TEST BUG: RACE_TRIALS/);
  });

  it("trims RACE_TRIALS and treats blank as default", () => {
    assert.equal(raceTrialsFromEnv({ RACE_TRIALS: " 3 " }), 3);
    assert.equal(raceTrialsFromEnv({ RACE_TRIALS: "   " }), 5);
  });

  it("defaults RACE_MAX_SPREAD_MS to 5 when unset", () => {
    assert.equal(raceMaxSpreadMsFromEnv({}), 5);
  });

  it("parses RACE_MAX_SPREAD_MS=10", () => {
    assert.equal(raceMaxSpreadMsFromEnv({ RACE_MAX_SPREAD_MS: "10" }), 10);
  });

  it("rejects invalid RACE_MAX_SPREAD_MS", () => {
    for (const raw of ["0", "-1", "abc", "3abc", "3.5", "1e3"]) {
      assert.throws(() => raceMaxSpreadMsFromEnv({ RACE_MAX_SPREAD_MS: raw }), /TEST BUG/);
    }
  });

  it("rejects fractional and exponent RACE_MAX_SPREAD_MS", () => {
    assert.throws(
      () => raceMaxSpreadMsFromEnv({ RACE_MAX_SPREAD_MS: "3.5" }),
      /TEST BUG: RACE_MAX_SPREAD_MS/,
    );
    assert.throws(
      () => raceMaxSpreadMsFromEnv({ RACE_MAX_SPREAD_MS: "1e3" }),
      /TEST BUG: RACE_MAX_SPREAD_MS/,
    );
  });

  it("defaults RACE_MAX_SPREAD_RERUNS to 3 and parses 1 and 7", () => {
    assert.equal(raceMaxSpreadRerunsFromEnv({}), 3);
    assert.equal(raceMaxSpreadRerunsFromEnv({ RACE_MAX_SPREAD_RERUNS: "1" }), 1);
    assert.equal(raceMaxSpreadRerunsFromEnv({ RACE_MAX_SPREAD_RERUNS: " 7 " }), 7);
    assert.equal(raceMaxSpreadRerunsFromEnv({ RACE_MAX_SPREAD_RERUNS: "  " }), 3);
  });

  it("rejects 0, negatives, fractions, exponents and junk in RACE_MAX_SPREAD_RERUNS", () => {
    for (const raw of ["0", "-1", "abc", "3abc", "3.5", "1e3", "+2", "0x2"]) {
      assert.throws(
        () => raceMaxSpreadRerunsFromEnv({ RACE_MAX_SPREAD_RERUNS: raw }),
        /TEST BUG: RACE_MAX_SPREAD_RERUNS must be an integer >= 1/,
        raw,
      );
    }
  });

  it("defaults RACE_MAX_INVALID_SHARE_PCT to 20 and parses 0, 1, 20 and 100", () => {
    assert.equal(raceMaxInvalidSharePctFromEnv({}), 20);
    assert.equal(raceMaxInvalidSharePctFromEnv({ RACE_MAX_INVALID_SHARE_PCT: "0" }), 0);
    assert.equal(raceMaxInvalidSharePctFromEnv({ RACE_MAX_INVALID_SHARE_PCT: "1" }), 1);
    assert.equal(raceMaxInvalidSharePctFromEnv({ RACE_MAX_INVALID_SHARE_PCT: "100" }), 100);
  });

  it("rejects negatives, fractions, exponents, junk and above 100 in RACE_MAX_INVALID_SHARE_PCT", () => {
    for (const raw of ["-5", "abc", "12.5", "1e2", "101", "1000", "+5", "00", "0x5"]) {
      assert.throws(
        () => raceMaxInvalidSharePctFromEnv({ RACE_MAX_INVALID_SHARE_PCT: raw }),
        /TEST BUG: RACE_MAX_INVALID_SHARE_PCT must be an integer between 0 and 100/,
        raw,
      );
    }
  });

  it("defaults RACE_MIN_INVALID_BUDGET to 2 and parses 0, 1 and 12", () => {
    assert.equal(raceMinInvalidBudgetFromEnv({}), 2);
    assert.equal(raceMinInvalidBudgetFromEnv({ RACE_MIN_INVALID_BUDGET: "  " }), 2);
    assert.equal(raceMinInvalidBudgetFromEnv({ RACE_MIN_INVALID_BUDGET: "0" }), 0);
    assert.equal(raceMinInvalidBudgetFromEnv({ RACE_MIN_INVALID_BUDGET: "1" }), 1);
    assert.equal(raceMinInvalidBudgetFromEnv({ RACE_MIN_INVALID_BUDGET: " 12 " }), 12);
  });

  it("rejects negatives, fractions, exponents and junk in RACE_MIN_INVALID_BUDGET", () => {
    for (const raw of ["-1", "abc", "1.5", "1e1", "+1", "00", "0x1", "2abc"]) {
      assert.throws(
        () => raceMinInvalidBudgetFromEnv({ RACE_MIN_INVALID_BUDGET: raw }),
        /TEST BUG: RACE_MIN_INVALID_BUDGET must be an integer >= 0/,
        raw,
      );
    }
  });

  it("medusa base URL fallback strips trailing slash", () => {
    assert.equal(medusaBaseUrlFromEnv({}), "http://127.0.0.1:9000");
    assert.equal(
      medusaBaseUrlFromEnv({ MEDUSA_BASE_URL: "http://127.0.0.1:9000/" }),
      "http://127.0.0.1:9000",
    );
  });

  it("medusa admin email unset throws TEST BUG with env name", () => {
    assert.throws(() => medusaAdminEmailFromEnv({}), /TEST BUG: MEDUSA_ADMIN_EMAIL/);
    assert.throws(
      () => medusaAdminEmailFromEnv({ MEDUSA_ADMIN_EMAIL: "  " }),
      /MEDUSA_ADMIN_EMAIL/,
    );
    assert.equal(
      medusaAdminEmailFromEnv({ MEDUSA_ADMIN_EMAIL: " admin@qa.local " }),
      "admin@qa.local",
    );
  });

  it("medusa admin password unset throws TEST BUG with env name", () => {
    assert.throws(() => medusaAdminPasswordFromEnv({}), /TEST BUG: MEDUSA_ADMIN_PASSWORD/);
    assert.throws(
      () => medusaAdminPasswordFromEnv({ MEDUSA_ADMIN_PASSWORD: "" }),
      /MEDUSA_ADMIN_PASSWORD/,
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

  it("cal base URL fallback strips trailing slash", () => {
    assert.equal(calBaseUrlFromEnv({}), "http://127.0.0.1:3000");
    assert.equal(
      calBaseUrlFromEnv({ CAL_BASE_URL: "http://127.0.0.1:3000/" }),
      "http://127.0.0.1:3000",
    );
    assert.equal(calBaseUrlFromEnv({ CAL_BASE_URL: "   " }), "http://127.0.0.1:3000");
  });

  it("cal database URL fallback order", () => {
    assert.equal(calDatabaseUrlFromEnv({ P6_CAL_DATABASE_URL: "postgres://p6" }), "postgres://p6");
    assert.equal(calDatabaseUrlFromEnv({ CAL_DB_URL: "postgres://harness" }), "postgres://harness");
    assert.equal(calDatabaseUrlFromEnv({}), "postgresql://postgres@127.0.0.1:5450/calendso");
    assert.equal(
      calDatabaseUrlFromEnv({
        P6_CAL_DATABASE_URL: "postgres://p6",
        CAL_DB_URL: "postgres://harness",
      }),
      "postgres://p6",
    );
  });
});
