// Pure join of the Documenso pipeline stages per document (plan task 9 §6.3). No I/O: the stage reads the rows.

export interface StageInput {
  documents: {
    documentId: number;
    envelopeId: string;
    completedAtMs: number | null;
    lastSignedMs: number | null;
  }[];
  sealJobs: { documentId: number; status: string; completedAtMs: number | null }[];
  webhookJobs: {
    documentId: number;
    status: string;
    retried: number;
    completedAtMs: number | null;
  }[];
  webhookCalls: {
    documentId: number;
    status: string;
    responseCode: number | null;
    createdAtMs: number;
  }[];
  deliveries: { documentId: number; receivedAtMs: number; status: number }[];
  emailJobs: { envelopeId: string; status: string; completedAtMs: number | null }[];
  emails: { envelopeId: string; postedMs: number }[];
}

export type Stage =
  "completed" | "seal" | "webhookJob" | "webhookCall" | "receiver" | "emailJob" | "email";
export const STAGES: Stage[] = [
  "completed",
  "seal",
  "webhookJob",
  "webhookCall",
  "receiver",
  "emailJob",
  "email",
];

export interface DocumentLag {
  documentId: number;
  reached: Record<Stage, boolean>;
  lagMs: Partial<Record<Stage, number>>;
  counts: { seal: number; webhookJob: number; receiverOk: number; emailJob: number };
}

export interface LagSummary {
  documents: number;
  missing: Record<Stage, number>;
  duplicated: Record<string, number>;
  p50: Partial<Record<Stage, number>>;
  p95: Partial<Record<Stage, number>>;
  max: Partial<Record<Stage, number>>;
  overContract: number;
}

/** Lag of each stage from the document's last signature. A stage counts as reached when its row exists. */
export function joinStages(input: StageInput): DocumentLag[] {
  return input.documents.map((doc) => {
    const id = doc.documentId;
    const base = doc.lastSignedMs;
    const reached = Object.fromEntries(STAGES.map((s) => [s, false])) as Record<Stage, boolean>;
    const lagMs: Partial<Record<Stage, number>> = {};
    const mark = (stage: Stage, ms: number | null | undefined) => {
      if (ms === null || ms === undefined) return;
      reached[stage] = true;
      if (base !== null) lagMs[stage] = ms - base;
    };
    reached.completed = doc.completedAtMs !== null;

    const seals = input.sealJobs.filter((j) => j.documentId === id && j.status === "COMPLETED");
    mark("seal", seals[0]?.completedAtMs);
    const hooks = input.webhookJobs.filter((j) => j.documentId === id && j.status === "COMPLETED");
    mark("webhookJob", hooks[0]?.completedAtMs);
    const calls = input.webhookCalls.filter((c) => c.documentId === id && c.status === "SUCCESS");
    mark("webhookCall", calls[0]?.createdAtMs);
    const ok = input.deliveries.filter((d) => d.documentId === id && d.status === 200);
    mark("receiver", ok[0]?.receivedAtMs);
    const emailJobs = input.emailJobs.filter(
      (j) => j.envelopeId === doc.envelopeId && j.status === "COMPLETED",
    );
    mark("emailJob", emailJobs[0]?.completedAtMs);
    const emails = input.emails.filter((e) => e.envelopeId === doc.envelopeId);
    mark("email", emails[0]?.postedMs);

    return {
      documentId: id,
      reached,
      lagMs,
      counts: {
        seal: seals.length,
        webhookJob: hooks.length,
        receiverOk: ok.length,
        emailJob: emailJobs.length,
      },
    };
  });
}

/** Nearest-rank percentile of a sorted list; undefined for an empty list. */
function percentile(sorted: number[], p: number): number | undefined {
  if (sorted.length === 0) return undefined;
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

/** Summary per stage: missing (not reached), duplicated (more than one row), percentiles and lags over the contract. */
export function summariseLag(docs: DocumentLag[], contractMs: number): LagSummary {
  const missing = Object.fromEntries(
    STAGES.map((s) => [s, docs.filter((d) => !d.reached[s]).length]),
  ) as Record<Stage, number>;
  const duplicated = {
    seal: docs.filter((d) => d.counts.seal > 1).length,
    webhookJob: docs.filter((d) => d.counts.webhookJob > 1).length,
    receiverOk: docs.filter((d) => d.counts.receiverOk > 1).length,
    emailJob: docs.filter((d) => d.counts.emailJob > 1).length,
  };
  const p50: Partial<Record<Stage, number>> = {};
  const p95: Partial<Record<Stage, number>> = {};
  const max: Partial<Record<Stage, number>> = {};
  let overContract = 0;
  for (const s of STAGES) {
    const values = docs
      .map((d) => d.lagMs[s])
      .filter((v): v is number => typeof v === "number")
      .sort((a, b) => a - b);
    const a = percentile(values, 50);
    const b = percentile(values, 95);
    if (a !== undefined) p50[s] = a;
    if (b !== undefined) p95[s] = b;
    if (values.length > 0) max[s] = values[values.length - 1];
    overContract += values.filter((v) => v > contractMs).length;
  }
  return { documents: docs.length, missing, duplicated, p50, p95, max, overContract };
}
