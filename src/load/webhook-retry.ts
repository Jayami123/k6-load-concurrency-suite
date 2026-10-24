// Pure judge of the webhook retry (plan task 9 §6.4). Details are numbers only.

export interface RetryInput {
  events: number;
  deliveries: { eventKey: string; status: number }[];
  calls: { eventKey: string; status: string; responseCode: number | null }[];
  jobs: { eventKey: string; status: string; retried: number }[];
  completedEnvelopes: number;
  documents: number;
}

export interface RetryFinding {
  check: string;
  ok: boolean;
  kind?: "PRODUCT BUG" | "TEST BUG";
  detail: string;
}

const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Exactly one 500 then one 200 per event; one FAILED (500) and one SUCCESS (200) call; one COMPLETED job with retried 1. */
export function judgeWebhookRetry(i: RetryInput): { ok: boolean; findings: RetryFinding[] } {
  const findings: RetryFinding[] = [];
  const keys = [...new Set(i.deliveries.map((d) => d.eventKey))];

  const deliveryBad = keys.filter((k) => {
    const seq = i.deliveries.filter((d) => d.eventKey === k).map((d) => d.status);
    return !same(seq, [500, 200]);
  });
  findings.push({
    check: "deliveries",
    ok: deliveryBad.length === 0 && keys.length === i.events,
    kind: deliveryBad.length === 0 && keys.length === i.events ? undefined : "PRODUCT BUG",
    detail: `${keys.length} of ${i.events} events delivered; ${deliveryBad.length} with a status sequence other than 500 then 200`,
  });

  const callBad = keys.filter((k) => {
    const calls = i.calls.filter((c) => c.eventKey === k);
    const failed = calls.filter((c) => c.status === "FAILED" && c.responseCode === 500).length;
    const success = calls.filter((c) => c.status === "SUCCESS" && c.responseCode === 200).length;
    return !(calls.length === 2 && failed === 1 && success === 1);
  });
  findings.push({
    check: "calls",
    ok: callBad.length === 0,
    kind: callBad.length === 0 ? undefined : "PRODUCT BUG",
    detail: `${callBad.length} events without exactly one FAILED (500) and one SUCCESS (200) call`,
  });

  const jobBad = keys.filter((k) => {
    const jobs = i.jobs.filter((j) => j.eventKey === k);
    return !(jobs.length === 1 && jobs[0]?.status === "COMPLETED" && jobs[0]?.retried === 1);
  });
  findings.push({
    check: "job",
    ok: jobBad.length === 0,
    kind: jobBad.length === 0 ? undefined : "PRODUCT BUG",
    detail: `${jobBad.length} events whose job is not one COMPLETED job with retried 1`,
  });

  const envelopesOk = i.completedEnvelopes === i.documents;
  findings.push({
    check: "envelopes",
    ok: envelopesOk,
    kind: envelopesOk ? undefined : "PRODUCT BUG",
    detail: `${i.completedEnvelopes} of ${i.documents} envelopes COMPLETED`,
  });

  return { ok: findings.every((f) => f.ok), findings };
}
