import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IntentLog } from "../../src/load/knee/intents.ts";
import {
  evaluatePipeline,
  evaluatePipelineKnee,
  type KneeDocuments,
} from "../../src/load/pipeline-stage.ts";
import type { StageInput } from "../../src/load/pipeline-lag.ts";

const PREFIX = "p6-x";
const DRAIN = { drained: true, drainMs: 0 };

/** One document with every stage reached (signed at 1000 ms). */
function complete(): StageInput {
  return {
    documents: [{ documentId: 1, envelopeId: "e1", completedAtMs: 1100, lastSignedMs: 1000 }],
    sealJobs: [{ documentId: 1, status: "COMPLETED", completedAtMs: 1200 }],
    webhookJobs: [{ documentId: 1, status: "COMPLETED", retried: 0, completedAtMs: 1300 }],
    webhookCalls: [{ documentId: 1, status: "SUCCESS", responseCode: 200, createdAtMs: 1400 }],
    deliveries: [{ documentId: 1, receivedAtMs: 1500, status: 200 }],
    emailJobs: [{ envelopeId: "e1", status: "COMPLETED", completedAtMs: 1600 }],
    emails: [{ envelopeId: "e1", postedMs: 1700 }],
  };
}

function log(outcomes: Array<[number, "ok" | "fail", boolean]>): IntentLog {
  return {
    outcomes: new Map(outcomes.map(([i, outcome, net]) => [i, { outcome, net, ghost: false }])),
    duplicateLines: [],
    beyondStarted: [],
  };
}

describe("documenso knee judgement", () => {
  it("unfinished documents of indeterminate intents do not raise a missing stage", () => {
    const input = complete();
    input.documents.push({
      documentId: 2,
      envelopeId: "e2",
      completedAtMs: null,
      lastSignedMs: null,
    });
    const knee: KneeDocuments = {
      prefix: PREFIX,
      started: 2,
      interrupted: 1,
      log: log([[0, "ok", false]]), // intent 1 has no line: indeterminate
      rows: [
        { title: `${PREFIX}-i0 journey`, completed: true },
        { title: `${PREFIX}-i1 journey`, completed: false },
      ],
    };
    const plain = evaluatePipeline(input, DRAIN);
    assert.ok(
      plain.reasons.some((r) => /seal missing/.test(r)),
      "a Phase 3 judgement counts the unfinished document as missing",
    );
    const verdict = evaluatePipelineKnee(input, DRAIN, knee);
    assert.deepEqual(verdict.reasons, []);
    assert.equal(verdict.ok, true);
  });

  it("an unfinished document of an ok intent, of a fail intent and of no started intent are PRODUCT BUG lines with the intent and the counts", () => {
    const knee: KneeDocuments = {
      prefix: PREFIX,
      started: 2,
      interrupted: 0,
      log: log([
        [0, "ok", false],
        [1, "fail", false],
      ]),
      rows: [
        { title: `${PREFIX}-i0 journey`, completed: false },
        { title: `${PREFIX}-i1 journey`, completed: false },
        { title: `${PREFIX}-i9 journey`, completed: false },
      ],
    };
    const verdict = evaluatePipelineKnee(complete(), DRAIN, knee);
    assert.ok(
      verdict.reasons.includes(
        "PRODUCT BUG: intent 0 was told ok and has 1 unfinished envelope(s)",
      ),
    );
    assert.ok(
      verdict.reasons.includes(
        "PRODUCT BUG: intent 1 was told fail and has 1 unfinished envelope(s)",
      ),
    );
    assert.ok(
      verdict.reasons.includes(
        "PRODUCT BUG: 1 envelope(s) map to no started intent (ghost document)",
      ),
    );
    assert.equal(verdict.kind, "PRODUCT BUG");
  });

  it("completed documents still fail on a missing stage, a duplicated webhook job, and a double seal counts under P6-OBS-DOC-002", () => {
    const knee: KneeDocuments = {
      prefix: PREFIX,
      started: 0,
      interrupted: 0,
      log: log([]),
      rows: [],
    };

    const noCall = complete();
    noCall.webhookCalls = [];
    assert.ok(
      evaluatePipelineKnee(noCall, DRAIN, knee).reasons.includes(
        "PRODUCT BUG: webhookCall missing for 1 of 1 documents",
      ),
    );

    const twoHooks = complete();
    twoHooks.webhookJobs.push({
      documentId: 1,
      status: "COMPLETED",
      retried: 0,
      completedAtMs: 1310,
    });
    assert.ok(
      evaluatePipelineKnee(twoHooks, DRAIN, knee).reasons.includes(
        "PRODUCT BUG: webhookJob duplicated for 1 documents",
      ),
    );

    const twoSeals = complete();
    twoSeals.sealJobs.push({ documentId: 1, status: "COMPLETED", completedAtMs: 1210 });
    const sealed = evaluatePipelineKnee(twoSeals, DRAIN, knee);
    assert.equal(sealed.knownBugs["P6-OBS-DOC-002"], 1);
    assert.equal(
      sealed.reasons.some((r) => /seal/.test(r)),
      false,
    );
  });
});
