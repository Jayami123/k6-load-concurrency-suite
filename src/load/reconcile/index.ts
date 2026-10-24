import type { AuditResult } from "./types.ts";
import type { Stage, StageResult } from "../types.ts";

/** Runs stages in order and merges their data. A not-ok stage does not stop the next one; the first failing kind is reported. */
export function composeStages(stages: Stage[]): Stage {
  return async (ctx) => {
    let ok = true;
    let kind: StageResult["kind"];
    const reasons: string[] = [];
    const data: Record<string, unknown> = {};
    for (const stage of stages) {
      const r = await stage(ctx);
      if (!r.ok && ok) kind = r.kind;
      ok = ok && r.ok;
      reasons.push(...r.reasons);
      Object.assign(data, r.data);
    }
    return { ok, kind: ok ? undefined : kind, reasons, data };
  };
}

/** Maps an audit to a stage result. Violations fail; a known bug is counted in the reasons and does not fail; an unexpected known bug fails (owner Q1). */
export function auditToStageResult(result: AuditResult): StageResult {
  const reasons: string[] = [];
  for (const v of result.violations) reasons.push(`${v.kind}: ${v.text}`);
  for (const [id, count] of Object.entries(result.knownBugs))
    reasons.push(`known bug ${id}: ${count} (counted, not a failure)`);
  for (const line of result.unexpected) reasons.push(`PRODUCT BUG: unexpected ${line}`);
  const productBug =
    result.violations.some((v) => v.kind === "PRODUCT BUG") || result.unexpected.length > 0;
  const testBug = result.violations.some((v) => v.kind === "TEST BUG");
  const ok = result.violations.length === 0 && result.unexpected.length === 0;
  return {
    ok,
    kind: ok ? undefined : productBug ? "PRODUCT BUG" : testBug ? "TEST BUG" : undefined,
    reasons,
    data: {
      audit: { product: result.product, rowsSeen: result.rowsSeen, checks: result.checks.length },
    },
  };
}
