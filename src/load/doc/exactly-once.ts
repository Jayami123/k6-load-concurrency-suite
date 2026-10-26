// The exactly-once verdict of P6-DOC-LOAD-003 (plan Phase 4b task 9 §6.4). Pure: the joins and the reads come from the caller.
import { pairCounts } from "./pair-key.ts";

export interface SequentialDoc {
  docId: string;
  seal: number; // COMPLETED seal jobs only
  failedSeal: number; // FAILED seal jobs after drain: any value is a FAIL
  pendingSeal: number; // seal jobs still PENDING or PROCESSING after the drain: any value is a FAIL
  audit: number;
  webhook: number;
  webhookPayloadMatched: boolean; // a mismatch between the WebhookCall body and the document's payload is a FAIL
  matchedRecipientTokens: string[]; // one entry per completion email joined to a Recipient.token; duplicates are kept
  recipients: number;
}

export interface ExactlyOnceVerdict {
  sequentialDocs: number;
  sequentialExact: number; // documents that pass every check
  pairDocs: number; // distinct pair keys
  pairKnownDuplicates: number; // pair keys with a duplicate seal or audit row, counted under P6-OBS-DOC-002
  verdict: "PASS" | "PASS (P6-OBS-DOC-002 counted)" | "FAIL (PRODUCT BUG)" | "TEST BUG" | "INVALID";
  reasons: string[];
}

/** The failures of one sequential document; an empty list means exact. */
function failuresOf(d: SequentialDoc): string[] {
  const out: string[] = [];
  if (d.seal !== 1) out.push(`seal ${d.seal}`);
  if (d.failedSeal !== 0) out.push(`failed seal ${d.failedSeal}`);
  if (d.pendingSeal !== 0) out.push(`pending seal ${d.pendingSeal}`);
  if (d.audit !== 1) out.push(`audit ${d.audit}`);
  if (d.webhook !== 1) out.push(`webhook ${d.webhook}`);
  if (!d.webhookPayloadMatched) out.push("webhook payload differs");
  if (d.matchedRecipientTokens.length !== d.recipients)
    out.push(`${d.matchedRecipientTokens.length} completion emails for ${d.recipients} recipients`);
  if (new Set(d.matchedRecipientTokens).size !== d.matchedRecipientTokens.length)
    out.push("a recipient received two completion emails");
  return out;
}

/**
 * A sequential document is exact only when every check of failuresOf holds. Precedence, one outcome per run, highest first: TEST BUG
 * (testBugReasons, setup or drain failure) > FAIL (PRODUCT BUG) (unmatchedWebhookCalls above 0: an unexplained call, checked before the
 * invalid reasons so INVALID cannot hide it) > INVALID (invalidReasons: telemetry, dropped iterations, the L9 reconciliation failure, an
 * unmatched token) > FAIL (PRODUCT BUG) (a sequential document not exact) > PASS (P6-OBS-DOC-002 counted) (pair duplicates counted) > PASS.
 * The pair stream is never a FAIL on its own: its duplicates are the known bug.
 */
export function classifyExactlyOnce(input: {
  sequential: SequentialDoc[];
  pairRows: Array<{ documentId: string; pairId: string; kind: "seal" | "audit" }>;
  invalidReasons: string[];
  testBugReasons: string[];
  unmatchedWebhookCalls?: number; // calls on the run's webhook that name no run document: an unexplained side effect (0 when absent)
}): ExactlyOnceVerdict {
  const failures = input.sequential.map((d) => ({ docId: d.docId, why: failuresOf(d) }));
  const exact = failures.filter((f) => f.why.length === 0).length;
  const counts = pairCounts(input.pairRows);
  const knownDuplicates = [...counts.values()].filter((c) => c.seal > 0 || c.audit > 0).length;
  const base = {
    sequentialDocs: input.sequential.length,
    sequentialExact: exact,
    pairDocs: counts.size,
    pairKnownDuplicates: knownDuplicates,
  };
  if (input.testBugReasons.length > 0)
    return { ...base, verdict: "TEST BUG", reasons: input.testBugReasons };
  // An unexplained call is a product failure. It is not hidden by INVALID, so it is checked before the invalid reasons.
  const unmatched = input.unmatchedWebhookCalls ?? 0;
  if (unmatched > 0)
    return {
      ...base,
      verdict: "FAIL (PRODUCT BUG)",
      reasons: [`${unmatched} webhook call(s) on the run's webhook name no run document`],
    };
  if (input.invalidReasons.length > 0)
    return { ...base, verdict: "INVALID", reasons: input.invalidReasons };
  const bad = failures
    .filter((f) => f.why.length > 0)
    .map((f) => `${f.docId}: ${f.why.join(", ")}`);
  if (bad.length > 0) return { ...base, verdict: "FAIL (PRODUCT BUG)", reasons: bad };
  if (knownDuplicates > 0)
    return {
      ...base,
      verdict: "PASS (P6-OBS-DOC-002 counted)",
      reasons: [`${knownDuplicates} pair key(s) with a duplicate row (P6-OBS-DOC-002)`],
    };
  return { ...base, verdict: "PASS", reasons: [] };
}
