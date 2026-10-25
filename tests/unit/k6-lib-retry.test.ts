import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPlan, classifyAttempt, runAttempts, CAL_REDACTED } from "../../k6/lib/retry.js";

const CAL = { stormTimeoutMs: 35, stormAttempts: 3, finalTimeoutMs: 30000, delayMs: 0 };

describe("k6 lib retry plan", () => {
  it("the plan ends with the long final step and the storm steps are short", () => {
    const plan = buildPlan(CAL);
    assert.equal(plan.length, 4);
    assert.deepEqual(
      plan.map((s) => s.timeoutMs),
      [35, 35, 35, 30000],
    );
    assert.equal(plan.at(-1)?.parallel, 1);
  });

  it("a parallelRetries value makes the final step send that many identical requests", () => {
    const plan = buildPlan({
      stormTimeoutMs: 25,
      stormAttempts: 1,
      parallelRetries: 3,
      finalTimeoutMs: 30000,
      delayMs: 0,
    });
    assert.deepEqual(
      plan.map((s) => s.parallel),
      [1, 3],
    );
  });

  it("runAttempts sends N identical requests for a parallel step", () => {
    const plan = buildPlan({
      stormTimeoutMs: 25,
      stormAttempts: 0,
      parallelRetries: 3,
      finalTimeoutMs: 30000,
      delayMs: 0,
    });
    let sent = 0;
    const out = runAttempts(
      plan,
      () => {
        sent += 3;
        return [{ status: 200 }, { status: 409 }, { status: 409 }];
      },
      { sleep: () => {} },
    );
    assert.equal(sent, 3);
    assert.equal(out.attempts.length, 3);
    assert.equal(out.resolved, true);
  });

  it("classifyAttempt: 200 is ok, status 0 is a timeout, 409 is a conflict", () => {
    assert.equal(classifyAttempt(200, undefined), "ok");
    assert.equal(classifyAttempt(0, undefined), "timeout");
    assert.equal(classifyAttempt(409, '{"message":"no_available_users_found_error"}'), "conflict");
  });

  it("classifyAttempt: a 400 with the redacted message is redacted400; another 4xx is refused", () => {
    assert.equal(classifyAttempt(400, CAL_REDACTED), "redacted400");
    assert.equal(classifyAttempt(400, "Something else"), "refused");
    assert.equal(classifyAttempt(422, undefined), "refused");
  });

  it("classifyAttempt: 5xx is server5xx and an unknown status is other", () => {
    assert.equal(classifyAttempt(500, undefined), "server5xx");
    assert.equal(classifyAttempt(503, undefined), "server5xx");
    assert.equal(classifyAttempt(302, undefined), "other");
  });

  it("runAttempts stops at the first ok answer", () => {
    const plan = buildPlan(CAL);
    const answers = [{ status: 0 }, { status: 200 }, { status: 200 }, { status: 200 }];
    const sent: number[] = [];
    const out = runAttempts(
      plan,
      (_step, n) => {
        sent.push(n);
        return [answers[n] ?? { status: 0 }];
      },
      { sleep: () => {} },
    );
    assert.equal(out.resolved, true);
    assert.deepEqual(sent, [0, 1]);
    assert.deepEqual(
      out.attempts.map((a) => a.class),
      ["timeout", "ok"],
    );
  });

  it("runAttempts sends the same body object every time", () => {
    const body = { json: { id: "p6-intent-1" } };
    const seen: unknown[] = [];
    runAttempts(
      buildPlan(CAL),
      () => {
        seen.push(body);
        return [{ status: 0 }];
      },
      { sleep: () => {} },
    );
    assert.equal(seen.length, 4);
    assert.ok(seen.every((b) => b === body));
  });

  it("runAttempts sleeps only when delayMs > 0", () => {
    const sleeps: number[] = [];
    const send = () => [{ status: 0 }];
    const sleep = (ms: number) => {
      sleeps.push(ms);
    };
    runAttempts(buildPlan({ ...CAL, delayMs: 0 }), send, { sleep });
    assert.deepEqual(sleeps, []);
    runAttempts(buildPlan({ ...CAL, delayMs: 100 }), send, { sleep });
    assert.deepEqual(sleeps, [100, 100, 100]);
  });
});
