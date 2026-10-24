import type { AuditResult } from "./types.ts";
import { addFinding } from "./types.ts";

export interface DocumensoEnvelopeRow {
  status: string;
  sealJobs: number;
  stuckJobs: number;
  completedAudit: number;
}

export interface DocumensoSnapshot {
  envelopes: DocumensoEnvelopeRow[];
  clientCompleted?: number;
  sequentialCompletions: boolean;
}

/** Polls the stuck-job count every pollMs until 0 or timeoutMs (default 30 000). The database wrapper that gives the count is added with the Documenso product case (Task 7). */
export async function waitForDrain(
  countStuck: () => Promise<number>,
  opts: {
    timeoutMs?: number;
    pollMs?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<{ drained: boolean; drainMs: number }> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const pollMs = opts.pollMs ?? 500;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const start = now();
  for (;;) {
    if ((await countStuck()) === 0) return { drained: true, drainMs: now() - start };
    if (now() - start >= timeoutMs) return { drained: false, drainMs: now() - start };
    await sleep(pollMs);
  }
}

/** Pure. Checks in order: rows, drain, sealed-once (a double seal is a known bug; with sequential completions it is unexpected), client-matches-db. */
export function evaluateDocumensoAudit(
  s: DocumensoSnapshot,
  prefixLike: string,
  drain: { drained: boolean; drainMs: number },
): AuditResult {
  const result: AuditResult = {
    schema: 1,
    product: "documenso",
    prefixLike,
    rowsSeen: s.envelopes.length,
    drainMs: drain.drainMs,
    checks: [],
    violations: [],
    knownBugs: {},
    unexpected: [],
    pending: [],
    leak: [],
  };
  const check = (name: string, ok: boolean, detail: string) =>
    result.checks.push({ name, ok, detail });
  const bug = (text: string) => addFinding(result, { kind: "PRODUCT BUG", text });

  check("rows", s.envelopes.length >= 1, `${s.envelopes.length} envelope(s)`);
  if (s.envelopes.length < 1)
    addFinding(result, {
      kind: "TEST BUG",
      text: `audit saw no envelopes (scope LIKE ${prefixLike})`,
    });

  const stuck = s.envelopes.reduce((n, e) => n + e.stuckJobs, 0);
  const drainOk = drain.drained && stuck === 0;
  check("drain", drainOk, `drained ${drain.drained} in ${drain.drainMs} ms, ${stuck} stuck job(s)`);
  if (!drainOk)
    bug(
      `pending jobs after ${drain.drainMs} ms drain (${s.envelopes.length} envelopes, ${stuck} stuck)`,
    );

  const completed = s.envelopes.filter((e) => e.status === "COMPLETED");
  for (const e of completed) {
    if (e.sealJobs === 0) bug("completed envelope never sealed");
    if (e.sealJobs > 1) {
      addFinding(result, {
        kind: "PRODUCT BUG",
        text: "double seal",
        knownBugId: "P6-OBS-DOC-002",
      });
      if (s.sequentialCompletions)
        result.unexpected.push("double seal with sequential completions");
    }
  }
  const sealOnce = completed.every((e) => e.sealJobs <= 1 && e.completedAudit === 1);
  check("sealed-once", sealOnce, `${completed.length} completed envelope(s)`);

  if (s.clientCompleted !== undefined) {
    const ok = completed.length === s.clientCompleted;
    check("client-matches-db", ok, `client ${s.clientCompleted}, database ${completed.length}`);
    if (!ok)
      bug(
        `client completed ${s.clientCompleted} envelopes, the database holds ${completed.length} completed`,
      );
  }
  return result;
}
