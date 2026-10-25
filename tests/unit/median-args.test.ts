import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMedianArgs } from "../../src/load/median-args.ts";

describe("load-medians arguments", () => {
  it("refuses an unknown option", () => {
    const r = parseMedianArgs(["run-a", "--metirc", "p95"]);
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.reason, /unknown option --metirc/);
  });

  it("refuses a repeated --metric", () => {
    const r = parseMedianArgs(["run-a", "--metric", "p95", "--metric", "requests"]);
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.reason, /only once/);
  });

  it("reads one metric, --json and the folders, keeping the first folder when --metric is absent", () => {
    assert.deepEqual(parseMedianArgs(["run-a", "run-b", "--json"]), {
      ok: true,
      metric: "requests",
      asJson: true,
      folders: ["run-a", "run-b"],
    });
    assert.deepEqual(parseMedianArgs(["--metric", "p95", "run-a"]), {
      ok: true,
      metric: "p95",
      asJson: false,
      folders: ["run-a"],
    });
  });
});
