export interface MailpitSummary {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
}

export interface MailpitMessage extends MailpitSummary {
  Text: string;
  HTML: string;
}

/** Mailpit lists newest first, so the first match is the latest. */
export function latestMessageFor(
  list: MailpitSummary[],
  address: string,
  subject: RegExp,
): MailpitSummary | null {
  return (
    list.find((m) => m.To.some((t) => t.Address === address) && subject.test(m.Subject)) ?? null
  );
}

/** The 64-hex reset token in the body. Returned to the caller only; never logged (D8). */
export function resetTokenFrom(msg: Pick<MailpitMessage, "Text" | "HTML">): string | null {
  return `${msg.Text}\n${msg.HTML}`.match(/[0-9a-f]{64}/)?.[0] ?? null;
}

/** The invite link: /invite/<workspace invite hash>?inviteToken=<token>. The hash is the last path segment. */
export function inviteFrom(
  msg: Pick<MailpitMessage, "Text" | "HTML">,
): { workspaceInviteHash: string; personalToken: string } | null {
  const url = `${msg.Text}\n${msg.HTML}`
    .match(/https?:\/\/[^\s"<>]+/g)
    ?.find((u) => /\/invite\//.test(u));
  if (!url) return null;
  const parsed = new URL(url);
  const personalToken = parsed.searchParams.get("inviteToken");
  const workspaceInviteHash = parsed.pathname.split("/").pop() ?? "";
  if (!personalToken || !workspaceInviteHash) return null;
  return { workspaceInviteHash, personalToken };
}

/** Polls the list until a matching message arrives. A message that never arrives is a setup error (TEST BUG). */
export async function waitForMessage(opts: {
  mailpitUrl: string;
  address: string;
  subject: RegExp;
  timeoutMs?: number;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<MailpitMessage> {
  const f = opts.fetchImpl ?? fetch;
  const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
  for (;;) {
    const list = (await (await f(`${opts.mailpitUrl}/api/v1/messages`)).json()) as {
      messages?: MailpitSummary[];
    };
    const hit = latestMessageFor(list.messages ?? [], opts.address, opts.subject);
    if (hit) {
      return (await (
        await f(`${opts.mailpitUrl}/api/v1/message/${hit.ID}`)
      ).json()) as MailpitMessage;
    }
    if (Date.now() >= deadline) {
      throw new Error(`TEST BUG: no mail matching ${opts.subject} arrived within the wait`);
    }
    await new Promise((r) => setTimeout(r, opts.intervalMs ?? 250));
  }
}
