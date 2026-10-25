import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  busyFraction,
  parseMemAvailableKb,
  parseProcStatCpu,
  readHostSample,
} from "../../src/load/telemetry/host-stats.ts";

const STAT_A = "cpu  100 0 100 800 0 0 0 0 0 0\ncpu0 50 0 50 400 0 0 0 0 0 0\n";
const STAT_B = "cpu  300 0 200 1000 0 0 0 0 0 0\ncpu0 150 0 100 500 0 0 0 0 0 0\n";

describe("telemetry host sampler", () => {
  it("busy fraction from two /proc/stat reads", () => {
    const a = parseProcStatCpu(STAT_A)!;
    const b = parseProcStatCpu(STAT_B)!;
    assert.deepEqual(a, { busy: 200, total: 1000 });
    assert.deepEqual(b, { busy: 500, total: 1500 });
    assert.equal(busyFraction(a, b), 300 / 500);
  });

  it("the first sample has no busy fraction; the reading is kept for the next one", () => {
    const readers = { stat: () => STAT_A, meminfo: () => "MemTotal: 16000000 kB\n" };
    const first = readHostSample(undefined, readers);
    assert.equal(first.sample.busyFraction, undefined);
    assert.ok(first.cpu, "the reading is returned");
    const second = readHostSample(first.cpu, { stat: () => STAT_B, meminfo: readers.meminfo });
    assert.equal(second.sample.busyFraction, 0.6);
  });

  it("MemAvailable is parsed in kB", () => {
    assert.equal(
      parseMemAvailableKb("MemTotal:  16000000 kB\nMemAvailable:   1234567 kB\n"),
      1234567,
    );
    assert.equal(parseMemAvailableKb("MemTotal: 1 kB\n"), undefined);
  });
});
