import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  firstSaturated,
  type RuleSample,
  type Window,
} from "../../src/load/knee/first-saturated.ts";

const STEP_MS = 30_000;

function windows(n: number): Window[] {
  return Array.from({ length: n }, (_, index) => ({
    index,
    fromMs: index * STEP_MS,
    toMs: (index + 1) * STEP_MS,
  }));
}

/** One sample per second over n windows. `cores` makes the application cpu ticks cumulative; `extra` adds the fields of a sample. */
function build(
  n: number,
  extra: (t: number, w: number) => Partial<RuleSample>,
  cores?: (w: number) => number,
): RuleSample[] {
  const out: RuleSample[] = [];
  let ticks = 0;
  for (let t = 0; t <= n * STEP_MS; t += 1000) {
    const w = Math.min(n - 1, Math.floor(t / STEP_MS));
    const sample: RuleSample = { t, ...extra(t, w) };
    if (cores) {
      if (t > 0) ticks += cores(w) * 100;
      sample.proc = { cpuTicks: ticks, ...sample.proc };
    }
    out.push(sample);
  }
  return out;
}

const NONE = { maxConnections: 10 };

describe("knee first saturated resource", () => {
  it("application cores are read from the cpu ticks of consecutive samples", () => {
    const samples = build(
      3,
      () => ({}),
      () => 0.5,
    );
    const r = firstSaturated({
      samples,
      windows: windows(3),
      limits: NONE,
      sources: { proc: { present: true } },
    });
    assert.equal(r.perResource.app_cpu.observed, true);
    assert.deepEqual(
      r.perResource.app_cpu.fractionByStep.map((x) => Math.round(x * 100) / 100),
      [1, 1, 1],
      "the ratio to the peak step mean",
    );
    assert.equal(r.resource, "none_observed", "0.5 cores is below the 0.9 floor");
  });

  it("a resource saturates when it is over its level in at least half of a step's samples", () => {
    // 27 trimmed samples per window (2 s to 28 s): 14 waiting is 52 %, 13 is 48 %.
    const waitingUpTo = (limit: number) =>
      build(3, (t) => {
        const sec = t % STEP_MS;
        return { db: { total: 1, waiting: sec >= 2000 && sec <= limit ? 1 : 0, waitingLocks: 0 } };
      });
    const yes = firstSaturated({
      samples: waitingUpTo(15_000),
      windows: windows(3),
      limits: NONE,
      sources: { db: { present: true } },
    });
    assert.deepEqual([yes.resource, yes.step], ["db_wait", 0]);
    const no = firstSaturated({
      samples: waitingUpTo(14_000),
      windows: windows(3),
      limits: NONE,
      sources: { db: { present: true } },
    });
    assert.deepEqual([no.resource, no.step], ["none_observed", null]);
  });

  it("a blip that later recovers is not saturated; only the step from which it stays is", () => {
    const samples = build(3, (_t, w) => ({
      db: { total: 1, waiting: w === 1 ? 0 : 1, waitingLocks: 0 },
    }));
    const r = firstSaturated({
      samples,
      windows: windows(3),
      limits: NONE,
      sources: { db: { present: true } },
    });
    assert.equal(r.perResource.db_wait.firstSaturatedStep, 2);
    assert.deepEqual([r.resource, r.step], ["db_wait", 2]);
  });

  it("two resources saturating at the same step: the priority order decides", () => {
    const samples = build(3, (_t, w) => ({
      db: { total: w >= 1 ? 9 : 1, waiting: w >= 1 ? 1 : 0, waitingLocks: 0 },
    }));
    const r = firstSaturated({
      samples,
      windows: windows(3),
      limits: { maxConnections: 10 },
      sources: { db: { present: true } },
    });
    assert.equal(r.perResource.db_wait.firstSaturatedStep, 1);
    assert.equal(r.perResource.db_conn.firstSaturatedStep, 1);
    assert.deepEqual([r.resource, r.step], ["db_wait", 1], "db_wait is before db_conn in PRIORITY");
  });

  it("db_wait is named when the database has waiting sessions from a step on", () => {
    const samples = build(3, (_t, w) => ({
      db: { total: 1, waiting: w === 2 ? 2 : 0, waitingLocks: 0 },
    }));
    const r = firstSaturated({
      samples,
      windows: windows(3),
      limits: NONE,
      sources: { db: { present: true } },
    });
    assert.deepEqual([r.resource, r.step], ["db_wait", 2]);
  });

  it("none_observed when no resource saturates at any step", () => {
    const samples = build(3, () => ({ db: { total: 1, waiting: 0, waitingLocks: 0 } }));
    const r = firstSaturated({
      samples,
      windows: windows(3),
      limits: NONE,
      sources: { db: { present: true } },
    });
    assert.deepEqual([r.resource, r.step], ["none_observed", null]);
  });

  it("an absent source is listed, never named; over-level samples in the 2 s edges are trimmed", () => {
    // host reads 95 % busy, but its source is absent: it is listed and never named.
    const absent = build(3, () => ({ host: { busyFraction: 0.95 } }));
    const a = firstSaturated({
      samples: absent,
      windows: windows(3),
      limits: NONE,
      sources: { host: { present: false } },
    });
    assert.deepEqual(a.absentSources, ["host"]);
    assert.equal(a.perResource.runner_cpu.observed, false);
    assert.equal(a.resource, "none_observed");
    // waiting only at 0 s, 1 s and 29 s of each window: all three are inside the trimmed edges.
    const edges = build(3, (t) => ({
      db: { total: 1, waiting: [0, 1000, 29000].includes(t % STEP_MS) ? 1 : 0, waitingLocks: 0 },
    }));
    const e = firstSaturated({
      samples: edges,
      windows: windows(3),
      limits: NONE,
      sources: { db: { present: true } },
    });
    assert.deepEqual([e.resource, e.step], ["none_observed", null]);
  });

  it("app_cpu is run-relative (R2) and runner_cpu is a per-sample level", () => {
    const cores = [0.5, 0.6, 0.92];
    const samples = build(
      3,
      () => ({ host: { busyFraction: 0.9 } }),
      (w) => cores[w]!,
    );
    const r = firstSaturated({
      samples,
      windows: windows(3),
      limits: NONE,
      sources: { proc: { present: true }, host: { present: true } },
    });
    assert.equal(
      r.perResource.app_cpu.firstSaturatedStep,
      2,
      "0.92 is at least 0.85 of the peak and 0.9 cores",
    );
    assert.equal(
      r.perResource.runner_cpu.firstSaturatedStep,
      0,
      "95 % busy is over 0.85 in every step",
    );
    assert.deepEqual([r.resource, r.step], ["runner_cpu", 0]);
  });
});
