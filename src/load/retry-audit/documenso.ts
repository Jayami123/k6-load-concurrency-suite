import type pg from "pg";
import { DOCUMENT_COMPLETED_AUDIT_SQL, SEAL_JOBS_SQL } from "../../documenso/oracle.ts";
import type { createInbucketClient } from "../../documenso/inbucket.ts";
import { mailboxName } from "../../documenso/inbucket.ts";
import { selectRows } from "../../oracles/pg.ts";
import { ENVELOPES_BY_TITLE_SQL } from "../reconcile/documenso.ts";
import { completionTokenOf } from "../pipeline-email.ts";
import type { RetryCounters, RetryFinding, RetryJudgement } from "../retry-validity.ts";
import { judgeStorm } from "../retry-validity.ts";

/** The recipients of one envelope: the token of the signing link and whether the recipient has signed. Read-only. */
export const RECIPIENTS_FOR_ENVELOPE_SQL = `SELECT token, email, ("signedAt" IS NOT NULL) AS signed FROM "Recipient" WHERE "envelopeId" = $1`;

export interface DocumensoRetryRow {
  status: string;
  sealJobs: number;
  completedAudit: number;
  signedRecipients: number;
  recipients: number;
  emailsPerRecipient: number[];
}

export interface DocumensoRetryInput {
  intents: number;
  rows: DocumensoRetryRow[];
  counters: RetryCounters;
}

const DOC_KNOWN_DOUBLE_SEAL = "P6-OBS-DOC-002";

/**
 * Pure. Storm first, then per document: COMPLETED, one seal job, one DOCUMENT_COMPLETED audit row, every recipient signed,
 * exactly one completion email per recipient, and no 5xx. A double seal is also counted under P6-OBS-DOC-002.
 * ALREADY_SIGNED answers are allowed and never required.
 */
export function judgeDocumensoRetries(i: DocumensoRetryInput): RetryJudgement {
  const findings: RetryFinding[] = [];
  const knownBugs: Record<string, number> = {};
  const c = i.counters;

  const storm = judgeStorm({
    intents: c.intents,
    firstTimeouts: c.firstTimeouts,
    retries: c.attempts - c.intents,
  });
  findings.push({ check: "storm", ok: storm.ok, kind: storm.kind, detail: storm.detail });

  const notCompleted = i.rows.filter((r) => r.status !== "COMPLETED").length;
  findings.push({
    check: "document-completed",
    ok: notCompleted === 0,
    kind: notCompleted > 0 ? "PRODUCT BUG" : undefined,
    detail: `${notCompleted} document(s) not COMPLETED`,
  });

  const doubleSeals = i.rows.filter((r) => r.sealJobs !== 1).length;
  const extraSeals = i.rows.reduce((sum, r) => sum + Math.max(0, r.sealJobs - 1), 0);
  if (extraSeals > 0) knownBugs[DOC_KNOWN_DOUBLE_SEAL] = extraSeals;
  findings.push({
    check: "one-seal-per-document",
    ok: doubleSeals === 0,
    kind: doubleSeals > 0 ? "PRODUCT BUG" : undefined,
    detail: `${doubleSeals} document(s) without exactly one seal job`,
  });

  const badAudit = i.rows.filter((r) => r.completedAudit !== 1).length;
  findings.push({
    check: "one-completed-audit-row",
    ok: badAudit === 0,
    kind: badAudit > 0 ? "PRODUCT BUG" : undefined,
    detail: `${badAudit} document(s) without exactly one DOCUMENT_COMPLETED row`,
  });

  const unsigned = i.rows.filter((r) => r.signedRecipients !== r.recipients).length;
  findings.push({
    check: "recipients-signed",
    ok: unsigned === 0,
    kind: unsigned > 0 ? "PRODUCT BUG" : undefined,
    detail: `${unsigned} document(s) with a recipient not signed`,
  });

  const emailsOff = i.rows.reduce(
    (sum, r) => sum + r.emailsPerRecipient.filter((n) => n !== 1).length,
    0,
  );
  findings.push({
    check: "one-email-per-recipient",
    ok: emailsOff === 0,
    kind: emailsOff > 0 ? "PRODUCT BUG" : undefined,
    detail: `${emailsOff} recipient(s) without exactly one completion email`,
  });

  findings.push({
    check: "no-5xx",
    ok: c.retry5xx === 0,
    kind: c.retry5xx > 0 ? "PRODUCT BUG" : undefined,
    detail: `${c.retry5xx} attempt(s) answered 5xx`,
  });

  return { findings, knownBugs };
}

/**
 * Reads each envelope of the case: its seal jobs, DOCUMENT_COMPLETED rows, recipients, and each recipient's completion
 * emails (matched by the token of the completion link in its own mailbox). Read-only; the mail reads are GETs.
 */
export async function readDocumensoRetryRows(
  pool: pg.Pool,
  cfg: { prefixLike: string },
  inbucket: ReturnType<typeof createInbucketClient>,
): Promise<DocumensoRetryRow[]> {
  const envelopes = await selectRows<{ id: string; secondaryId: string; status: string }>(
    pool,
    ENVELOPES_BY_TITLE_SQL,
    [cfg.prefixLike],
  );
  const rows: DocumensoRetryRow[] = [];
  for (const env of envelopes) {
    const documentId = /^document_(\d+)$/.exec(env.secondaryId)?.[1] ?? "";
    const seals = documentId ? await selectRows(pool, SEAL_JOBS_SQL, [documentId]) : [];
    const audit = await selectRows<{ n: number }>(pool, DOCUMENT_COMPLETED_AUDIT_SQL, [env.id]);
    const recipients = await selectRows<{ token: string; email: string; signed: boolean }>(
      pool,
      RECIPIENTS_FOR_ENVELOPE_SQL,
      [env.id],
    );
    const emailsPerRecipient: number[] = [];
    for (const r of recipients) {
      const mailbox = mailboxName(r.email);
      let n = 0;
      for (const item of await inbucket.list(mailbox)) {
        const full = await inbucket.get(mailbox, item.id);
        if (completionTokenOf(full.body) === r.token) n += 1;
      }
      emailsPerRecipient.push(n);
    }
    rows.push({
      status: env.status,
      sealJobs: seals.length,
      completedAudit: Number(audit[0]?.n ?? 0),
      signedRecipients: recipients.filter((r) => r.signed).length,
      recipients: recipients.length,
      emailsPerRecipient,
    });
  }
  return rows;
}
