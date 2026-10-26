// The input of the exactly-once verdict of P6-DOC-LOAD-003 (plan Phase 4b task 9 §6.4, §7). Pure: the rows, the email tokens and the
// k6 P6_DOC lines come from the caller. A missing or extra iteration is INVALID here (L9), never a pass.
import type { ExactlyOnceVerdict, SequentialDoc } from "./exactly-once.ts";
import { classifyExactlyOnce } from "./exactly-once.ts";

/** One document of the run, joined from its envelope rows (the caller reads them; this module only joins). */
export interface DocRows {
  envelopeId: string;
  documentId: number;
  recipients: number;
  sealStatuses: string[]; // every seal job of the document, by status (COMPLETED, FAILED, PENDING, PROCESSING, ...)
  audit: number; // DOCUMENT_COMPLETED audit rows
  webhookEnvelopeIds: Array<string | null>; // the envelope id in each webhook call body, one entry per call
  webhookStatuses: string[]; // the status of each webhook call, one entry per call
  matchedTokens: string[]; // completion-email tokens that joined to this document's recipients
}

/** One P6_DOC line from the k6 log (src/documenso journey, one per iteration). */
export interface IterationLine {
  intent: string; // "<prefix>-i<n> sequential" or "<prefix>-i<n> pair"
  pairId: string | null;
  documentId: number | null;
  completed: boolean;
  failedStep: string | null;
}

export interface ExactlyOnceInput {
  sequential: SequentialDoc[];
  pairRows: Array<{ documentId: string; pairId: string; kind: "seal" | "audit" }>;
  invalidReasons: string[];
  testBugReasons: string[];
}

/** The webhook call is one of this document's when its body names the document's envelope. */
function callsOf(d: DocRows): Array<{ envelopeId: string | null; status: string }> {
  return d.webhookEnvelopeIds.map((envelopeId, i) => ({
    envelopeId,
    status: d.webhookStatuses[i] ?? "",
  }));
}

/**
 * Pure. Joins the iteration lines to the document rows and builds the classifier input. Sequential documents come from the
 * `sequential` lines, pair documents from the `pair` lines. Any mismatch between the lines and the rows, any iteration that did
 * not complete, and any dropped iteration is INVALID (L9: no count slack).
 */
export function buildExactlyOnceInput(input: {
  docs: DocRows[];
  lines: IterationLine[];
  droppedIterations: number;
}): ExactlyOnceInput {
  const invalidReasons: string[] = [];
  const testBugReasons: string[] = [];
  if (input.lines.length === 0)
    testBugReasons.push("TEST BUG: no P6_DOC iteration lines in the k6 log");
  if (input.droppedIterations > 0)
    invalidReasons.push(`${input.droppedIterations} dropped iteration(s)`);

  const docOf = new Map(input.docs.map((d) => [d.documentId, d]));
  const sequential: SequentialDoc[] = [];
  const pairRows: ExactlyOnceInput["pairRows"] = [];
  let sequentialLines = 0;

  for (const line of input.lines) {
    if (!line.completed) {
      invalidReasons.push(
        `iteration ${line.intent} did not complete (failed step ${line.failedStep ?? "?"})`,
      );
      continue;
    }
    if (line.documentId === null) {
      invalidReasons.push(`iteration ${line.intent} completed without a document id`);
      continue;
    }
    const d = docOf.get(line.documentId);
    if (d === undefined) {
      invalidReasons.push(
        `iteration ${line.intent} has no document row (document ${line.documentId})`,
      );
      continue;
    }
    if (line.pairId !== null) {
      // a pair document: its side effects are counted under P6-OBS-DOC-002 by pair key, never as a verdict input on their own
      for (const s of d.sealStatuses)
        if (s === "COMPLETED")
          pairRows.push({ documentId: String(d.documentId), pairId: line.pairId, kind: "seal" });
      for (let i = 0; i < d.audit; i++)
        pairRows.push({ documentId: String(d.documentId), pairId: line.pairId, kind: "audit" });
      continue;
    }
    sequentialLines++;
    const calls = callsOf(d);
    sequential.push({
      docId: String(d.documentId),
      seal: d.sealStatuses.filter((s) => s === "COMPLETED").length,
      failedSeal: d.sealStatuses.filter((s) => s === "FAILED").length,
      pendingSeal: d.sealStatuses.filter((s) => s === "PENDING" || s === "PROCESSING").length,
      audit: d.audit,
      webhook: calls.length,
      // a call is this document's only when its body names this envelope; a call that names another is a mismatch
      webhookPayloadMatched: calls.every((c) => c.envelopeId === d.envelopeId),
      matchedRecipientTokens: d.matchedTokens,
      recipients: d.recipients,
    });
  }

  const sequentialDocs = input.docs.length - pairDocCount(input.lines, docOf);
  if (sequentialLines !== sequentialDocs)
    invalidReasons.push(
      `L9: ${sequentialLines} sequential iteration lines, ${sequentialDocs} sequential document rows`,
    );
  return { sequential, pairRows, invalidReasons, testBugReasons };
}

/** The number of distinct pair documents named by the lines (a document is one iteration, so the count is the lines'). */
function pairDocCount(lines: IterationLine[], docOf: Map<number, DocRows>): number {
  const pairDocs = new Set<number>();
  for (const l of lines)
    if (l.pairId !== null && l.documentId !== null && docOf.has(l.documentId))
      pairDocs.add(l.documentId);
  return pairDocs.size;
}

/** Pure. The verdict of the joined input (classifyExactlyOnce, plan §6.4). */
export function exactlyOnceVerdictOf(input: ExactlyOnceInput): ExactlyOnceVerdict {
  return classifyExactlyOnce(input);
}
