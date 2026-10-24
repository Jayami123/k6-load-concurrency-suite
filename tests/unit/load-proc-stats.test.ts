import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cpuBusyPct,
  memAvailablePct,
  parseCpuLine,
  parseProcStat,
  startResourceSampler,
} from "../../src/load/proc-stats.ts";

describe("load proc stats", () => {
  it("reads a stat line whose command name contains spaces and parentheses", () => {
    const line =
      "4242 (k6 (run) worker) S 1 4242 4242 0 -1 4194560 100 0 0 0 7 3 0 0 20 0 1 0 1 0 0";
    assert.deepEqual(parseProcStat(line), { ticks: 10, pgrp: 4242 });
  });

  it("sums user and system ticks", () => {
    assert.equal(parseProcStat("1 (x) R 0 1 1 0 0 0 0 0 0 0 40 25 0 0").ticks, 65);
  });

  it("computes the busy percentage from two lines of /proc/stat", () => {
    const a = parseCpuLine("cpu 100 0 100 800 0 0 0 0");
    const b = parseCpuLine("cpu 200 0 200 1000 0 0 0 0");
    assert.equal(cpuBusyPct(a, b), 50);
  });

  it("excludes idle and iowait from the busy percentage", () => {
    const line = parseCpuLine("cpu 10 0 10 70 10 0 0 0");
    assert.equal(line.idle, 80);
    assert.equal(line.total, 100);
    assert.ok(Math.abs(cpuBusyPct({ total: 0, idle: 0 }, line) - 20) < 1e-9);
  });

  it("MemAvailable as a percentage of MemTotal", () => {
    assert.equal(memAvailablePct("MemTotal: 1000 kB\nMemAvailable: 250 kB\n"), 25);
  });

  it("the sampler averages the k6 cores, the busy percentage and the minimum memory from a fake /proc", () => {
    const files: Record<string, string> = {};
    let tick = 0;
    let t = 0;
    const sampler = startResourceSampler(7, {
      intervalMs: 1e9,
      clockTicksPerSec: 100,
      now: () => t,
      readFile: (p) => {
        if (p === "/proc/7/stat") return `7 (k6) S 1 7 7 0 -1 0 0 0 0 0 ${tick} 0 0 0`;
        if (p === "/proc/stat") return `cpu ${tick * 2} 0 0 ${tick * 2} 0 0 0 0`;
        if (p === "/proc/meminfo") return "MemTotal: 1000 kB\nMemAvailable: 400 kB";
        return (files[p] ??= "");
      },
    });
    for (const step of [0, 100, 200]) {
      tick = step;
      t += 1000;
      sampler.sample();
    }
    const s = sampler.stop();
    assert.ok(s);
    assert.equal(s.samples, 3);
    assert.equal(s.k6CoresAvg, 1);
    assert.equal(s.runnerBusyPctAvg, 50);
    assert.equal(s.memAvailablePctMin, 40);
  });

  it("with an unreadable /proc the sampler returns no summary", () => {
    const sampler = startResourceSampler(7, {
      intervalMs: 1e9,
      readFile: () => {
        throw new Error("ENOENT");
      },
    });
    sampler.sample();
    assert.equal(sampler.stop(), undefined);
  });
});
