import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { judgeUnfinished, type KneeDocuments } from "../../src/load/pipeline-stage.ts";
import { parseIntentLog } from "../../src/load/knee/intents.ts";
import { SUFFIX } from "../../src/load/knee/doc-intents.ts";

const PREFIX = "p6-qa-x-p6-doc-load-004";
const title = (intent: number) => `${PREFIX}-i${intent}${SUFFIX}`;

/** Three started intents: 0 is limited and failed, 1 is ok, 2 is fail without a limited line. */
function spike(
  over: Partial<KneeDocuments> & { extra?: Array<{ title: string; completed: boolean }> } = {},
): KneeDocuments {
  const log = parseIntentLog(
    [
      '{"intent":0,"outcome":"fail"}',
      '{"intent":0,"limited":true}',
      '{"intent":1,"outcome":"ok"}',
      '{"intent":2,"outcome":"fail"}',
    ]
      .map((m) => `time="t" level=info msg="${m.replace(/"/g, '\\"')}" source=console`)
      .join("\n"),
    3,
  );
  return {
    prefix: PREFIX,
    started: 3,
    interrupted: 0,
    log,
    rows: [
      { title: title(0), completed: false }, // the one unfinished envelope of the limited fail intent: exempt
      { title: title(1), completed: true },
      { title: title(2), completed: true },
      ...(over.extra ?? []),
    ],
    exemptLimited: true,
    limitedCounter: 1,
    ...over,
  };
}

describe("documenso spike pipeline judgement", () => {
  it("a clean spike result passes: the limited fail intent's one unfinished envelope is exempt", () => {
    const j = judgeUnfinished(spike());
    assert.deepEqual(j.reasons, []);
    assert.equal(j.indeterminate, 0);
  });

  it("an unfinished envelope of an ok intent fails, even in a spike run", () => {
    const j = judgeUnfinished(
      spike({
        rows: [
          { title: title(0), completed: false },
          { title: title(1), completed: false },
          { title: title(2), completed: true },
        ],
      }),
    );
    assert.ok(j.reasons.some((r) => /intent 1 was told ok and has 1 unfinished/.test(r)));
  });

  it("the exemption is off for any case but P6-DOC-LOAD-004, and a lost limited line is a TEST BUG", () => {
    const off = judgeUnfinished(
      spike({
        exemptLimited: false,
        rows: [
          { title: title(0), completed: false },
          { title: title(1), completed: true },
          { title: title(2), completed: true },
        ],
      }),
    );
    assert.ok(off.reasons.some((r) => /intent 0 was told fail and has 1 unfinished/.test(r)));
    const lost = judgeUnfinished(spike({ limitedCounter: 2 }));
    assert.ok(
      lost.reasons.some((r) => /TEST BUG: limited lines 1 differ from p6_iter_limited 2/.test(r)),
    );
  });
});
