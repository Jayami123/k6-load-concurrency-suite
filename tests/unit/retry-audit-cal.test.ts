import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  judgeCalRetries,
  type CalRetryInput,
  type LinkRow,
} from "../../src/load/retry-audit/cal.ts";
import type { RetryCounters } from "../../src/load/retry-validity.ts";

const counters = (over: Partial<RetryCounters> = {}): RetryCounters => ({
  intents: 10,
  attempts: 15,
  firstTimeouts: 5,
  intentsOk: 10,
  retryOk: 0,
  retryConflict: 0,
  retryRedacted400: 0,
  retryRefused: 0,
  retry5xx: 0,
  orderMismatch: 0,
  ...over,
});

const perIntent = (n = 10, each = 1): Record<string, number> =>
  Object.fromEntries(Array.from({ length: n }, (_, k) => [`i${k}`, each]));

const input = (over: Partial<CalRetryInput> = {}): CalRetryInput => ({
  intents: 10,
  acceptedPerIntent: perIntent(),
  counters: counters(),
  ...over,
});

const failed = (r: ReturnType<typeof judgeCalRetries>) => r.findings.filter((f) => !f.ok);

describe("retry audit: cal", () => {
  it("one accepted booking per intent passes", () => {
    const r = judgeCalRetries(input());
    assert.deepEqual(failed(r), []);
    assert.deepEqual(r.knownBugs, {});
  });

  it("a duplicate booking for one intent is a PRODUCT BUG", () => {
    const r = judgeCalRetries(input({ acceptedPerIntent: { ...perIntent(), i0: 2 } }));
    const f = r.findings.find((x) => x.check === "one-booking-per-intent");
    assert.equal(f?.ok, false);
    assert.equal(f?.kind, "PRODUCT BUG");
    assert.match(f?.detail ?? "", /1 intent\(s\)/);
  });

  it("redacted 400 retries are counted under P6-OBS-CAL-001 and do not fail", () => {
    const r = judgeCalRetries(input({ counters: counters({ retryRedacted400: 3 }) }));
    assert.deepEqual(failed(r), []);
    assert.equal(r.knownBugs["P6-OBS-CAL-001"], 3);
  });

  it("a 5xx answer is a PRODUCT BUG", () => {
    const r = judgeCalRetries(input({ counters: counters({ retry5xx: 1 }) }));
    const f = r.findings.find((x) => x.check === "no-5xx");
    assert.equal(f?.ok, false);
    assert.equal(f?.kind, "PRODUCT BUG");
  });

  it("an accepted booking missing though the client saw a 200 is a PRODUCT BUG", () => {
    const r = judgeCalRetries(input({ acceptedPerIntent: perIntent(9) }));
    const f = r.findings.find((x) => x.check === "accepted-missing");
    assert.equal(f?.ok, false);
    assert.equal(f?.kind, "PRODUCT BUG");
    assert.match(f?.detail ?? "", /10 intent\(s\) got a 200 but 9/);
  });

  it("a link used once of its cap of one passes", () => {
    const linkRows: LinkRow[] = Array.from({ length: 10 }, (_, k) => ({
      link: `p6-link-${k}`,
      usageCount: 1,
      maxUsageCount: 1,
    }));
    const r = judgeCalRetries(input({ linkRows }));
    assert.deepEqual(failed(r), []);
  });

  it("a link with usageCount 2 is a PRODUCT BUG related to F-C1", () => {
    const linkRows: LinkRow[] = [{ link: "p6-link-0", usageCount: 2, maxUsageCount: 1 }];
    const r = judgeCalRetries(input({ linkRows, acceptedPerIntent: perIntent(1) }));
    const f = r.findings.find((x) => x.check === "link-cap");
    assert.equal(f?.ok, false);
    assert.equal(f?.kind, "PRODUCT BUG");
    assert.match(f?.detail ?? "", /F-C1/);
  });

  it("two accepted bookings through one link use (usage 1) is a PRODUCT BUG", () => {
    const linkRows: LinkRow[] = [{ link: "p6-link-0", usageCount: 1, maxUsageCount: 1 }];
    const r = judgeCalRetries(input({ linkRows, acceptedPerIntent: { i0: 2 } }));
    const f = r.findings.find((x) => x.check === "link-usage");
    assert.equal(f?.ok, false);
    assert.equal(f?.kind, "PRODUCT BUG");
    assert.equal(f?.detail, "link usage 1, accepted bookings 2");
  });
});
