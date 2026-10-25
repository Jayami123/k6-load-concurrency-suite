import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BODY_A,
  BODY_B,
  ROUTES,
  UNPROBED,
  judgeRoute,
  type LimiterRoute,
  type Observation,
} from "../../src/load/spike/limiter-contract.ts";

const NOW = 1_800_000_000;
const trpc = ROUTES.find((r) => r.id === "trpc") as LimiterRoute;
const authorize = ROUTES.find((r) => r.id === "authorize") as LimiterRoute;

const OK: Observation = { status: 200, contentType: "application/json", body: "{}", headers: {} };
const LIMITED = (body: string, over: Record<string, string> = {}): Observation => ({
  status: 429,
  contentType: "application/json",
  body,
  headers: {
    "retry-after": "19",
    "x-ratelimit-limit": "100",
    "x-ratelimit-remaining": "0",
    "x-ratelimit-reset": String(NOW + 19),
    ...over,
  },
});

/** max answers of 200, then one 429 of the given body. */
const series = (route: LimiterRoute, post: Observation): Observation[] => [
  ...Array.from({ length: route.max }, () => OK),
  post,
];

describe("documenso limiter contract", () => {
  it("lists the ten probed routes with their limits", () => {
    assert.equal(ROUTES.length, 10);
    assert.deepEqual(
      ROUTES.map((r) => [r.id, r.max]),
      [
        ["trpc", 100],
        ["v2", 1000],
        ["v1", 1000],
        ["upload", 20],
        ["ai", 3],
        ["authorize", 10],
        ["forgot-password", 3],
        ["resend-verify-email", 3],
        ["verify-email", 5],
        ["reset-password", 5],
      ],
    );
  });

  it("accepts the family body of its route and rejects the other family's", () => {
    assert.deepEqual(judgeRoute(trpc, series(trpc, LIMITED(BODY_A)), NOW).findings, []);
    assert.equal(
      judgeRoute(trpc, series(trpc, LIMITED(BODY_B)), NOW).verdict,
      "PRODUCT BUG (SUSPECTED)",
    );
    assert.deepEqual(
      judgeRoute(authorize, series(authorize, LIMITED(BODY_B, { "x-ratelimit-limit": "10" })), NOW)
        .findings,
      [],
    );
  });

  it("checks the Retry-After, the limit, the remaining count and the reset header", () => {
    const bad = judgeRoute(
      trpc,
      series(
        trpc,
        LIMITED(BODY_A, {
          "retry-after": "0",
          "x-ratelimit-remaining": "3",
          "x-ratelimit-reset": String(NOW - 1),
        }),
      ),
      NOW,
    );
    assert.equal(bad.verdict, "PRODUCT BUG (SUSPECTED)");
    assert.equal(bad.findings.length, 3);
  });

  it("the 429 must be answer max + 1: an earlier one is a finding", () => {
    const early = [...Array.from({ length: 99 }, () => OK), LIMITED(BODY_A), OK];
    const j = judgeRoute(trpc, early, NOW);
    assert.match(j.findings[0] ?? "", /429 at answer 100, before the limit of 100/);
  });

  it("a 5xx before the limit is recorded under its suspected id and does not fail the route", () => {
    const obs = [
      { status: 500, body: "", headers: {} },
      ...series(authorize, LIMITED(BODY_B, { "x-ratelimit-limit": "10" })).slice(1),
    ];
    const j = judgeRoute(authorize, obs, NOW);
    assert.equal(j.verdict, "PASS");
    assert.deepEqual(j.preLimit5xx, { "P6-OBS-DOC-001": 1 });
  });

  it("the routes the probe did not measure are listed with a reason", () => {
    assert.ok(UNPROBED.length >= 7);
    assert.ok(UNPROBED.every((u) => u.reason.length > 0));
    assert.ok(UNPROBED.some((u) => u.id === "signup"));
  });

  it("too few answers is a TEST BUG, not a product finding", () => {
    const j = judgeRoute(trpc, [OK, OK], NOW);
    assert.equal(j.verdict, "TEST BUG");
  });
});
