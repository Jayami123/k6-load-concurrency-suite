// The completion emails of the Documenso pipeline (plan task 9, the email stage). A completion email has no envelope header, but its
// signing link is /sign/<token>/complete, and the token is the recipient's own (Recipient.token). The token is the join key: the
// envelope is the one of the recipient row that holds it. Tokens are used in memory only and never written or logged.
import { mailboxName } from "../documenso/inbucket.ts";
import type { RunContext } from "../documenso/run-case.ts";

/** A completion link: /sign/<token>/complete. The signing request has /sign/<token> and no suffix, so it does not match. */
export const COMPLETE_LINK = /\/sign\/([A-Za-z0-9_-]+)\/complete\b/;

export interface MailBody {
  text: string;
  html: string;
}

export interface CompletionEmail {
  envelopeId: string;
  postedMs: number;
}

/** The recipient token of a completion link in the body, or undefined. */
export function completionTokenOf(body: MailBody): string | undefined {
  return COMPLETE_LINK.exec(`${body.text}\n${body.html}`)?.[1];
}

/** Inbucket dates carry nanoseconds; the millisecond part is kept. An unparseable date is ENV (Inbucket changed), never a zero time. */
export function postedMsOf(date: string): number {
  const ms = Date.parse(date.replace(/(\.\d{3})\d+/, "$1"));
  if (!Number.isFinite(ms))
    throw new Error(`ENV: Inbucket message date is not ISO: ${date.slice(0, 40)}`);
  return ms;
}

/** Pure. Keeps the messages whose completion link carries a token of a run recipient, with that recipient's envelope. */
export function matchCompletionEmails(
  messages: Array<{ body: MailBody; date: string }>,
  envelopeOfToken: ReadonlyMap<string, string>,
): CompletionEmail[] {
  const out: CompletionEmail[] = [];
  for (const m of messages) {
    const token = completionTokenOf(m.body);
    const envelopeId = token === undefined ? undefined : envelopeOfToken.get(token);
    if (envelopeId === undefined) continue;
    out.push({ envelopeId, postedMs: postedMsOf(m.date) });
  }
  return out;
}

export interface RecipientRow {
  token: string;
  envelopeId: string;
  email: string;
}

/** Reads every recipient mailbox of the run and matches its completion emails. Mailboxes are the local parts of the recipient addresses. */
export async function readCompletionEmails(
  inbucket: RunContext["inbucket"],
  recipients: RecipientRow[],
): Promise<CompletionEmail[]> {
  const envelopeOfToken = new Map(recipients.map((r) => [r.token, r.envelopeId]));
  const mailboxes = [...new Set(recipients.map((r) => mailboxName(r.email)))];
  const out: CompletionEmail[] = [];
  for (const mailbox of mailboxes) {
    const messages: Array<{ body: MailBody; date: string }> = [];
    for (const item of await inbucket.list(mailbox)) {
      const full = await inbucket.get(mailbox, item.id);
      messages.push({ body: full.body, date: full.date });
    }
    out.push(...matchCompletionEmails(messages, envelopeOfToken));
  }
  return out;
}

/** Pure. Envelope id -> number of recipients (each recipient gets one completion email). */
export function expectedEmailsOf(recipients: RecipientRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of recipients) out.set(r.envelopeId, (out.get(r.envelopeId) ?? 0) + 1);
  return out;
}
