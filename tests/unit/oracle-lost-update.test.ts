import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertSchemaName,
  combineVerdicts,
  finalsSql,
  parseTw004,
  validityReasons,
  type T4Config,
} from "../../src/twenty/oracle-lost-update.ts";
import { joinVariantA, joinVariantB } from "../../src/load/lost-update.ts";

const SCHEMA = "workspace_1wgvd1injqtife6y4rvfbu3h5";

describe("lost update oracle", () => {
  it("builds the read-only finals query on the checked schema", () => {
    const sql = finalsSql(SCHEMA);
    assert.match(sql, new RegExp(`FROM ${SCHEMA}\\.company WHERE id = ANY\\(\\$1::uuid\\[\\]\\)`));
    assert.match(sql, /"deletedAt" IS NULL/);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|DROP)\b/i);
  });

  it("refuses a schema name that is not a workspace schema", () => {
    assert.equal(assertSchemaName(SCHEMA), SCHEMA);
    assert.throws(() => finalsSql("workspace_x;drop"), /TEST BUG: schema name not valid/);
    assert.throws(() => assertSchemaName("public"), /TEST BUG: schema name not valid/);
  });

  it("parses the TW004 lines of the k6 log and ignores every other line", () => {
    const log = [
      'time="x" level=info msg="start" source=console',
      'time="x" level=info msg="TW004 {\\"intentId\\":\\"A1-s1-0\\",\\"variant\\":\\"A\\",\\"status\\":200,\\"ambiguous\\":false}" source=console',
    ].join("\n");
    const intents = parseTw004(log);
    assert.equal(intents.length, 1);
    assert.equal(intents[0]!.intentId, "A1-s1-0");
    assert.equal(intents[0]!.status, 200);
  });

  it("combines the two variants: a variant A loss outranks a variant B finding", () => {
    const a = joinVariantA([], []);
    const b = joinVariantB([], []);
    assert.equal(combineVerdicts(a, b), "INCONCLUSIVE");
  });

  it("names the case's VALID breaches by code and count only", () => {
    const t4: T4Config = {
      records: { a: [], b: [] },
      stageRates: [0.5],
      stageSec: 120,
      initialEmployees: "0",
    };
    const summary = { metrics: { p6_t4_429: { count: 2 }, p6_tw_5xx: { count: 1 } } };
    const reasons = validityReasons([], summary, t4);
    assert.ok(reasons.some((r) => r.startsWith("main: HTTP_429: 2")));
    assert.ok(reasons.some((r) => r.startsWith("main: HTTP_5XX: 1")));
    assert.ok(
      reasons.some((r) => r.includes("RATE_OUT_OF_BAND: writer A1 stage 1 planned 60 achieved 0")),
    );
  });
});
