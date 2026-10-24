import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { startSampler } from "../../src/load/telemetry/sampler.ts";

/** A fake clock: sleep advances it and yields, so the loop runs deterministically. */
function fakeClock() {
  let t = 1_000_000;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
      await new Promise((r) => setImmediate(r));
    },
  };
}

const group = { cpuTicks: 10, rssMb: 1, fds: 3, members: 1 };

describe("telemetry sampler", () => {
  it("samples on the schedule without drift", async () => {
    const clock = fakeClock();
    const s = startSampler({
      product: "stub",
      intervalMs: 1000,
      now: clock.now,
      sleep: clock.sleep,
      readGroup: () => group,
      appProcess: [{ recordPath: "r", pgid: 1, label: "x" }],
    });
    for (let i = 0; i < 2000; i++) await new Promise((r) => setImmediate(r));
    const file = await s.stop();
    const starts = file.samples.map((x) => x.t - file.startedAtMs);
    assert.ok(starts.length >= 3);
    starts.forEach((offset, i) => assert.equal(offset, i * 1000));
  });

  it("an injected stall shows as one gap", async () => {
    const clock = fakeClock();
    const s = startSampler({
      product: "stub",
      intervalMs: 1000,
      now: clock.now,
      sleep: clock.sleep,
      injectGapMs: 3100,
      readGroup: () => group,
      appProcess: [{ recordPath: "r", pgid: 1, label: "x" }],
    });
    for (let i = 0; i < 4000; i++) await new Promise((r) => setImmediate(r));
    const file = await s.stop();
    assert.equal(file.gaps.length, 1);
    assert.ok(file.gaps[0]!.lengthMs > 2000);
  });

  it("an absent source is omitted from every sample", async () => {
    const clock = fakeClock();
    const s = startSampler({
      product: "stub",
      intervalMs: 1000,
      now: clock.now,
      sleep: clock.sleep,
    });
    for (let i = 0; i < 2000; i++) await new Promise((r) => setImmediate(r));
    const file = await s.stop();
    assert.equal(file.sources.proc?.present, false);
    assert.ok(file.samples.length > 0);
    assert.ok(file.samples.every((x) => x.proc === undefined));
  });

  it("stop writes the JSON and the CSV twin", async () => {
    const clock = fakeClock();
    const outDir = mkdtempSync(path.join(tmpdir(), "p6-telemetry-"));
    const s = startSampler({
      product: "stub",
      intervalMs: 1000,
      now: clock.now,
      sleep: clock.sleep,
      outDir,
      label: "normal",
      readGroup: () => group,
      appProcess: [{ recordPath: "r", pgid: 1, label: "x" }],
    });
    for (let i = 0; i < 2000; i++) await new Promise((r) => setImmediate(r));
    await s.stop();
    assert.ok(existsSync(path.join(outDir, "telemetry-normal.json")));
    assert.match(
      readFileSync(path.join(outDir, "telemetry-normal.csv"), "utf8"),
      /^t,cpuTicks,rssMb,fds,members,sampleCostMs\n/,
    );
  });

  it("a failing source is absent for that sample only", async () => {
    const clock = fakeClock();
    let calls = 0;
    const s = startSampler({
      product: "stub",
      intervalMs: 1000,
      now: clock.now,
      sleep: clock.sleep,
      appProcess: [{ recordPath: "r", pgid: 1, label: "x" }],
      readGroup: () => {
        calls += 1;
        if (calls === 2) throw new Error("EACCES");
        return group;
      },
    });
    for (let i = 0; i < 4000; i++) await new Promise((r) => setImmediate(r));
    const file = await s.stop();
    assert.equal(file.sources.proc?.errors, 1);
    assert.equal(file.samples[1]?.proc, undefined);
    assert.ok(file.samples.length >= 3 && file.samples[2]?.proc !== undefined);
  });
});
