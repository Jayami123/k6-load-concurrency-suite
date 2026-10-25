import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildKneeBounds,
  parseKneeBounds,
  selectKneeRuns,
  steadyRateFor,
  type KneeBoundProduct,
  type KneeRunRecord,
} from "../../src/load/knee/bounds.ts";
import type { KneeReport } from "../../src/load/knee/knee-report.ts";
import type { RunMeta } from "../../src/load/types.ts";

function run(
  caseId: string,
  runId: string,
  lowerRate: number,
  upperRate: number,
  over: {
    outcome?: string;
    validity?: string;
    event?: string;
    profile?: string;
    verdict?: string;
    imageVersion?: string;
    runUrl?: string | null;
  } = {},
): KneeRunRecord {
  const runUrl =
    over.runUrl === null
      ? undefined
      : (over.runUrl ?? `https://github.com/o/r/actions/runs/${runId}`);
  return {
    verdict: {
      runId,
      outcome: over.outcome ?? "PASS",
      validity: { verdict: over.validity ?? "VALID" },
    } as KneeRunRecord["verdict"],
    meta: {
      schema: 1,
      caseId,
      runId,
      profile: over.profile ?? "full",
      rate: 1,
      durationSec: 30,
      environment: {
        kind: "github-actions",
        event: over.event ?? "workflow_dispatch",
        ref: "main",
        runUrl,
        runnerImage: "ubuntu24",
        imageVersion: over.imageVersion ?? "20261023.334.3",
        nproc: 4,
      },
      software: { products: { cal: "x" } },
    } as unknown as RunMeta,
    report: {
      schema: 1,
      caseId,
      runId,
      verdict: over.verdict ?? "KNEE",
      range: { lowerStep: 1, upperStep: 2, lowerRate, upperRate },
    } as unknown as KneeReport,
  };
}

const CAL = "P6-CAL-LOAD-005";
const MED = "P6-MED-LOAD-004";

describe("knee bounds", () => {
  it("keeps the minimum lower rate and the median of the lower rates", () => {
    const b = buildKneeBounds({
      release: "p6-phase4a",
      runs: {
        cal: [run(CAL, "1001", 6, 8), run(CAL, "1002", 8, 10), run(CAL, "1003", 10, 12)],
      },
    });
    const c = b.products.cal!;
    assert.equal(c.lowerBoundRate, 6);
    assert.equal(c.medianLowerRate, 8);
    assert.equal(c.upperBoundRate, 12);
    assert.deepEqual(c.runIds, ["1001", "1002", "1003"]);
    assert.equal(c.n, 3);
  });

  it("needs three usable runs for a product and names the product when there are fewer", () => {
    assert.throws(
      () =>
        buildKneeBounds({
          release: "p6-phase4a",
          runs: { medusa: [run(MED, "2001", 1, 2), run(MED, "2002", 1, 2)] },
        }),
      /medusa \(P6-MED-LOAD-004\): 2 usable knee run\(s\), need at least 3/,
    );
  });

  it("excludes push, pr-profile and non-KNEE runs with their reasons", () => {
    const { used, excluded } = selectKneeRuns(CAL, [
      run(CAL, "3001", 6, 8),
      run(CAL, "3002", 6, 8, { event: "push" }),
      run(CAL, "3003", 6, 8, { profile: "pr" }),
      run(CAL, "3004", 6, 8, { verdict: "INVALID" }),
    ]);
    assert.deepEqual(
      used.map((r) => r.meta.runId),
      ["3001"],
    );
    const why = Object.fromEntries(excluded.map((e) => [e.runId, e.why.join("; ")]));
    assert.match(why["3002"]!, /event push/);
    assert.match(why["3003"]!, /profile pr/);
    assert.match(why["3004"]!, /knee verdict INVALID/);
  });

  it("parses an accepted file and rejects a bad run-id count, a non-ascending id list and a missing environment", () => {
    const good = buildKneeBounds({
      release: "p6-phase4a",
      runs: { cal: [run(CAL, "4001", 6, 8), run(CAL, "4002", 6, 8), run(CAL, "4003", 6, 8)] },
    });
    assert.doesNotThrow(() => parseKneeBounds(good));

    const count = structuredClone(good);
    count.products.cal!.n = 4;
    assert.throws(() => parseKneeBounds(count), /has n 4 for 3 run ids/);

    const order = structuredClone(good);
    order.products.cal!.runIds = ["4002", "4001", "4003"];
    assert.throws(() => parseKneeBounds(order), /not strictly ascending/);

    const env = structuredClone(good);
    delete env.products.cal!.environments["4003"];
    assert.throws(() => parseKneeBounds(env), /one environment per run id/);
  });

  it("halves the lower bound and rounds down to 0.1", () => {
    const b = buildKneeBounds({
      release: "p6-phase4a",
      runs: { cal: [run(CAL, "5001", 6, 8), run(CAL, "5002", 6, 8), run(CAL, "5003", 6, 8)] },
    });
    assert.equal(steadyRateFor(b, "cal"), 3);
    const odd = structuredClone(b);
    odd.products.cal!.lowerBoundRate = 1.5;
    assert.equal(steadyRateFor(odd, "cal"), 0.7);
  });

  it("rejects an absent product and a rate under 0.1", () => {
    const b = buildKneeBounds({
      release: "p6-phase4a",
      runs: { cal: [run(CAL, "6001", 6, 8), run(CAL, "6002", 6, 8), run(CAL, "6003", 6, 8)] },
    });
    assert.throws(() => steadyRateFor(b, "documenso" as KneeBoundProduct), /no documenso bound/);
    const tiny = structuredClone(b);
    tiny.products.cal!.lowerBoundRate = 0.1;
    assert.throws(() => steadyRateFor(tiny, "cal"), /under 0.1/);
  });
});
