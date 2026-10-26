// The Documenso limiter rule for unfinished documents (Phase 4 Task 6 §6.5). Pure. The exemption is exact: an intent is exempted only if
// it has a `fail` outcome line and a `limited` line and exactly one envelope, and that envelope is not COMPLETED.

export interface IntentEnvelope {
  status: string; // the envelope status at the end of the run, e.g. "COMPLETED" or "PENDING"
}

export interface IntentRecord {
  intent: number;
  outcome?: "ok" | "fail";
  limited: boolean; // the iteration has a {"intent":n,"limited":true} line
  envelopes: IntentEnvelope[];
}

/** Null when the intent is fine; otherwise the reason it is a finding (PRODUCT BUG (SUSPECTED), the ghost and duplicate rules unchanged). */
export function unfinishedFinding(rec: IntentRecord): string | null {
  const unfinished = rec.envelopes.filter((e) => e.status !== "COMPLETED").length;
  if (rec.limited && rec.envelopes.length !== 1)
    return `intent ${rec.intent}: limited with ${rec.envelopes.length} envelope(s), needs exactly 1`;
  if (unfinished === 0) return null;
  const exempt =
    rec.outcome === "fail" && rec.limited && rec.envelopes.length === 1 && unfinished === 1;
  return exempt
    ? null
    : `intent ${rec.intent}: ${unfinished} unfinished envelope(s) (outcome ${rec.outcome ?? "none"}, limited ${rec.limited})`;
}

/** A TEST BUG when the count of limited lines differs from the k6 counter of iterations that saw a 429 (a lost log line). */
export function limitedLineMismatch(limitedLines: number, counterLimited: number): string | null {
  return limitedLines === counterLimited
    ? null
    : `TEST BUG: limited lines ${limitedLines} differ from p6_iter_limited ${counterLimited} (a lost log line)`;
}
