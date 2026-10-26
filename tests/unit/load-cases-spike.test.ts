import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  CASES,
  CAL_LOAD_004,
  DOC_LOAD_004,
  DOC_LOAD_009,
  MED_LOAD_003,
  SPIKE_RATES,
} from "../../src/load/cases.ts";
import { parseKneeBounds, steadyRateFor } from "../../src/load/knee/bounds.ts";

const bounds = parseKneeBounds(JSON.parse(readFileSync("k6/thresholds/knee-bounds.json", "utf8")));

describe("load cases spike", () => {
  it("registers the four spike and limiter cases with their labels and exit codes", () => {
    for (const c of [CAL_LOAD_004, MED_LOAD_003, DOC_LOAD_004, DOC_LOAD_009]) {
      assert.ok(CASES[c.id], `${c.id} is registered`);
      assert.match(c.label, /spike|limiter/);
    }
    assert.deepEqual(CAL_LOAD_004.runs({ profileName: "full" } as never)[0]?.allowExits, [0]);
  });

  it("the Cal and Medusa rates derive from the knee bounds: 50 % steady, 150 % spike, rounded down to 0.1", () => {
    assert.equal(steadyRateFor(bounds, "cal"), SPIKE_RATES.cal.steadyRate);
    assert.equal(
      Math.floor(bounds.products.cal!.lowerBoundRate * 1.5 * 10 + 1e-9) / 10,
      SPIKE_RATES.cal.spikeRate,
    );
    assert.equal(steadyRateFor(bounds, "medusa"), SPIKE_RATES.medusa.steadyRate);
    assert.equal(
      Math.floor(bounds.products.medusa!.lowerBoundRate * 1.5 * 10 + 1e-9) / 10,
      SPIKE_RATES.medusa.spikeRate,
    );
  });

  it("the Documenso rates are the limiter's constants", () => {
    assert.deepEqual(SPIKE_RATES.documenso, { steadyRate: 0.2, spikeRate: 1.0 });
  });

  it("the package.json scripts exist", () => {
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
    for (const name of ["load:cal-spike", "load:medusa-spike", "load:documenso-limiter"])
      assert.ok(scripts[name], `${name} is in package.json`);
  });

  it("only P6-DOC-LOAD-004 may leave an unfinished document of a limited intent", () => {
    const flagged = Object.values(CASES)
      .filter((c) => c.limitedFailMayLeaveUnfinished === true)
      .map((c) => c.id);
    assert.deepEqual(flagged, ["P6-DOC-LOAD-004"]);
  });

  it('the bypass key is "false" exactly once, inside the documenso-limiter job, and not at that job\'s level', () => {
    const files = [".github/workflows/knee.yml", ".github/workflows/perf.yml"];
    const lines = files
      .flatMap((f) => readFileSync(f, "utf8").split("\n"))
      .filter((l) => l.trim() === 'DANGEROUS_BYPASS_RATE_LIMITS: "false"');
    assert.equal(lines.length, 1);
    const knee = readFileSync(".github/workflows/knee.yml", "utf8");
    const start = knee.indexOf("\n  documenso-limiter:\n") + 1;
    const rest = knee.slice(start + 5);
    const next = rest.search(/\n {2}[a-z][\w-]*:\n/);
    const job = knee.slice(start, next < 0 ? undefined : start + 5 + next);
    assert.ok(job.includes('DANGEROUS_BYPASS_RATE_LIMITS: "false"'));
    assert.ok(
      !/^ {6}DANGEROUS_BYPASS_RATE_LIMITS:/m.test(job),
      "the key is not set at the job level",
    );
  });
});

describe("spike scripts", () => {
  it("each spike script reads the run's spike block, not only its defaults", () => {
    for (const f of [
      "k6/cases/cal-load-004.js",
      "k6/cases/med-load-003.js",
      "k6/cases/doc-load-004.js",
    ]) {
      const text = readFileSync(f, "utf8");
      assert.match(text, /const sp = \{ \.\.\.cfg, \.\.\.\(cfg\.spike \?\? \{\}\) \};/, f);
      assert.match(text, /buildSpikePlan\(sp\)/, f);
    }
  });
});
