export type CompletionMode = "last-recipients" | "same-recipient" | "sequential-control";

export type CompletionClass =
  "SIGNED" | "ALREADY_SIGNED" | "client-error" | "server-error" | "other";

/** One completion response. A 200 is classified by its tRPC status. The body is never echoed. */
export function classifyCompletion(status: number | null, text: string): CompletionClass {
  if (status === null) return "other";
  if (status >= 500) return "server-error";
  if (status >= 400) return "client-error";
  if (status !== 200) return "other";
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    return "other";
  }
  const s = (json as { result?: { data?: { json?: { status?: unknown } } } } | null)?.result?.data
    ?.json?.status;
  if (s === "SIGNED") return "SIGNED";
  if (s === "ALREADY_SIGNED") return "ALREADY_SIGNED";
  return "other";
}

export function countClasses(classes: CompletionClass[]): Record<CompletionClass, number> {
  const out: Record<CompletionClass, number> = {
    SIGNED: 0,
    ALREADY_SIGNED: 0,
    "client-error": 0,
    "server-error": 0,
    other: 0,
  };
  for (const c of classes) out[c] += 1;
  return out;
}

export type SnapshotJob = { status: string; retried?: number };

/** Everything read for one trial, after the seal, email and webhook jobs are terminal (plan D23). */
export type TrialSnapshot = {
  sealJobs: SnapshotJob[];
  emailJobs: SnapshotJob[];
  webhookJobs: SnapshotJob[];
  completedAuditRows: number;
  itemDocs: number;
  itemsSealed: number;
  docDataDelta: number;
  completedEmails: number[]; // one count per recipient mailbox
  webhookDeliveries: number; // receiver deliveries whose payload.envelopeId is this envelope
  webhookCallRows: Array<{ status: string; responseCode: number | null }>; // this envelope only
  envelopeStatus: string | null; // Q2 setup: must be COMPLETED after the seal
  webhookHost: string;
};

export type TrialInput = {
  mode: CompletionMode;
  burst: number; // completions fired in the trial: 2 for 001 and the control, 10 for 002
  classes: CompletionClass[]; // one per completion request
  spreadMs: number;
  spreadLimitMs: number;
  snapshot: TrialSnapshot;
};

/** A trial double-seals when more than one seal job ran or more than one DOCUMENT_COMPLETED row exists. */
export function trialDoubleSealed(s: TrialSnapshot): boolean {
  return s.sealJobs.length > 1 || s.completedAuditRows > 1;
}

/** ENV: nothing was delivered and the WebhookCall row says the host was blocked (Task 6 §11). */
export function webhookBlockedEnv(s: TrialSnapshot): string | null {
  const blocked =
    s.webhookDeliveries === 0 &&
    s.webhookCallRows.some((r) => r.status === "FAILED" && r.responseCode === 0);
  return blocked
    ? `ENV: webhook blocked; NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS must list ${s.webhookHost}`
    : null;
}

function expectedResponses(
  mode: CompletionMode,
  burst: number,
): { signed: number; already: number } {
  if (mode === "same-recipient") return { signed: 1, already: burst - 1 };
  return { signed: burst, already: 0 }; // last-recipients and the control: each recipient signs once
}

/**
 * The invariant set behind 001, 002 and the control. Violations of the control are relabelled
 * "TEST BUG (control)": a failing control means a harness or sequencing problem until a repro proves otherwise.
 */
export function checkCompletionTrial(input: TrialInput): string[] {
  const label = input.mode === "sequential-control" ? "TEST BUG (control)" : "PRODUCT BUG";
  const v: string[] = [];
  const s = input.snapshot;
  const counts = countClasses(input.classes);
  const exp = expectedResponses(input.mode, input.burst);
  if (s.envelopeStatus !== "COMPLETED") {
    v.push(`${label}: envelope status ${s.envelopeStatus}, expected COMPLETED`);
  }

  if (input.spreadMs >= input.spreadLimitMs) {
    v.push(`TEST BUG: dispatchSpreadMs ${input.spreadMs} >= ${input.spreadLimitMs}`);
  }
  if (counts["server-error"] > 0)
    v.push(`${label}: completion HTTP 5xx x${counts["server-error"]}`);
  if (counts["client-error"] > 0)
    v.push(`${label}: completion HTTP 4xx x${counts["client-error"]}`);
  if (counts.other > 0)
    v.push(`${label}: completion response not SIGNED or ALREADY_SIGNED x${counts.other}`);
  if (counts.SIGNED !== exp.signed)
    v.push(`${label}: SIGNED responses ${counts.SIGNED}, expected ${exp.signed}`);
  if (counts.ALREADY_SIGNED !== exp.already) {
    v.push(`${label}: ALREADY_SIGNED responses ${counts.ALREADY_SIGNED}, expected ${exp.already}`);
  }
  if (s.sealJobs.length !== 1) v.push(`${label}: seal jobs ${s.sealJobs.length}, expected 1`);
  if (s.sealJobs.some((j) => j.status !== "COMPLETED")) v.push(`${label}: seal job not COMPLETED`);
  if (s.completedAuditRows !== 1)
    v.push(`${label}: DOCUMENT_COMPLETED rows ${s.completedAuditRows}, expected 1`);
  if (s.itemDocs !== 1 || s.itemsSealed !== 1) {
    v.push(`${label}: sealed items ${s.itemsSealed} of ${s.itemDocs}, expected 1 of 1`);
  }
  if (s.docDataDelta !== 2) {
    v.push(`${label}: DocumentData delta ${s.docDataDelta}, expected 2 (original + one sealed)`);
  }
  if (s.emailJobs.length !== 1)
    v.push(`${label}: completed-email jobs ${s.emailJobs.length}, expected 1`);
  for (const [i, n] of s.completedEmails.entries()) {
    if (n !== 1) v.push(`${label}: Signing Complete! for recipient ${i} x${n}, expected 1`);
  }
  if (s.webhookDeliveries !== 1) {
    v.push(`${label}: DOCUMENT_COMPLETED deliveries ${s.webhookDeliveries}, expected 1`);
  }
  if (s.webhookCallRows.length !== 1)
    v.push(`${label}: WebhookCall rows ${s.webhookCallRows.length}, expected 1`);
  if (s.webhookCallRows.some((r) => r.status !== "SUCCESS" || r.responseCode !== 200)) {
    v.push(`${label}: WebhookCall not SUCCESS 200`);
  }
  const env = webhookBlockedEnv(s);
  if (env) v.push(env);
  return v;
}

export const checkDoc001Trial = (input: TrialInput) =>
  checkCompletionTrial({ ...input, mode: "last-recipients" });
export const checkDoc002Trial = (input: TrialInput) =>
  checkCompletionTrial({ ...input, mode: "same-recipient" });
export const checkSequentialControl = (input: TrialInput) =>
  checkCompletionTrial({ ...input, mode: "sequential-control" });
