import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { soakStatistics, type SoakTelemetry } from "../../src/load/soak/report.ts";

/** One telemetry sample per second for 120 minutes, RSS from rss(minute). */
function telemetry(rss: (minute: number) => number): SoakTelemetry {
  const start = 1_000_000;
  return {
    samples: Array.from({ length: 7201 }, (_, s) => ({
      t: start + s * 1000,
      proc: { rssMb: rss(s / 60), fds: 80 },
      db: { total: 30 },
    })),
  };
}

describe("soak report carries the D33 check", () => {
  it("flags sustained RSS growth in the last hour and leaves the other statistics as they were", () => {
    const stats = soakStatistics(
      telemetry((m) => 1500 + 2 * m),
      1_000_000,
      7200,
    );
    assert.equal(stats.rssD33.flag, true);
    assert.equal(stats.rssMb.slope.reason, "ok");
    assert.equal(stats.durationSec, 7200);
  });

  it("anchors the window to the run end when the process reading stops early", () => {
    // RSS grows in the first hour only, then the process reading is missing for the last 30 minutes of the run
    const base = telemetry((m) => (m < 60 ? 1500 + 10 * m : 2100));
    const withoutEnd = {
      samples: base.samples.map((s, i) => (i >= 5401 ? { ...s, proc: undefined } : s)),
    };
    const stats = soakStatistics(withoutEnd, 1_000_000, 7200);
    assert.equal(stats.rssD33.flag, false);
  });

  it("does not flag a flat RSS", () => {
    const stats = soakStatistics(
      telemetry(() => 1800),
      1_000_000,
      7200,
    );
    assert.equal(stats.rssD33.flag, false);
  });
});
