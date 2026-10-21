export type InbucketSummary = {
  mailbox: string;
  id: string;
  from: string;
  to: string[];
  subject: string;
  date: string;
  size: number;
  seen: boolean;
};
export type InbucketMessage = InbucketSummary & {
  header: Record<string, string[]>;
  body: { text: string; html: string };
};

/** Inbucket's default mailbox name is the local part of the address (plan §2.5). */
export function mailboxName(address: string): string {
  const local = address.split("@")[0]?.toLowerCase() ?? "";
  if (!/^[a-z0-9._+-]+$/.test(local)) throw new Error(`TEST BUG: bad mailbox address ${address}`);
  return local;
}

export function envelopeIdOf(msg: Pick<InbucketMessage, "header">): string | null {
  return msg.header["X-Documenso-Envelope-Id"]?.[0] ?? null;
}

export function countForEnvelope(
  msgs: Array<Pick<InbucketMessage, "header">>,
  envelopeId: string,
): number {
  return msgs.filter((m) => envelopeIdOf(m) === envelopeId).length;
}

export function verifyEmailToken(msg: Pick<InbucketMessage, "body">): string | null {
  return (
    `${msg.body.text}\n${msg.body.html}`.match(/\/verify-email\/([A-Za-z0-9_-]+)/)?.[1] ?? null
  );
}

const drift = (what: string): never => {
  throw new Error(`ENV: Inbucket API drift: ${what} (image is unpinned latest; plan D14)`);
};

/** Validates the list shape recorded in plan §2.5; anything else is ENV, never a missing email. */
export function assertInbucketList(value: unknown): InbucketSummary[] {
  if (!Array.isArray(value)) drift("list is not an array");
  for (const item of value as Array<Record<string, unknown>>) {
    if (typeof item?.id !== "string") drift("list item id is not a string");
    if (typeof item.subject !== "string") drift("list item subject is not a string");
    if (!Array.isArray(item.to)) drift("list item to is not an array");
  }
  return value as InbucketSummary[];
}

export function assertInbucketMessage(value: unknown): InbucketMessage {
  const m = value as Record<string, unknown> | null;
  if (typeof m?.id !== "string") drift("message id is not a string");
  if (typeof m!.header !== "object" || m!.header === null) drift("message header is not an object");
  const body = m!.body as Record<string, unknown> | undefined;
  if (typeof body?.text !== "string" || typeof body.html !== "string") {
    drift("message body.text/html is not a string");
  }
  return value as InbucketMessage;
}

export function createInbucketClient(baseUrl: string) {
  const url = (mailbox: string, id?: string) =>
    `${baseUrl}/api/v1/mailbox/${encodeURIComponent(mailbox)}${id ? `/${encodeURIComponent(id)}` : ""}`;
  const json = async <T>(res: Response, what: string): Promise<T> => {
    const text = await res.text();
    if (res.status !== 200) throw new Error(`ENV: Inbucket ${what} HTTP ${res.status}`);
    return JSON.parse(text) as T;
  };
  return {
    list: async (mailbox: string) =>
      assertInbucketList(await json<unknown>(await fetch(url(mailbox)), "list")),
    get: async (mailbox: string, id: string) =>
      assertInbucketMessage(await json<unknown>(await fetch(url(mailbox, id)), "get")),
    purge: async (mailbox: string) => {
      const res = await fetch(url(mailbox), { method: "DELETE" });
      await res.text();
      if (res.status !== 200) throw new Error(`ENV: Inbucket purge HTTP ${res.status}`);
    },
    /** Polls until at least `min` messages exist; throws after `timeoutMs`. */
    async waitFor(
      mailbox: string,
      opts: { min?: number; timeoutMs?: number; intervalMs?: number } = {},
    ) {
      const { min = 1, timeoutMs = 15_000, intervalMs = 250 } = opts;
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const items = await this.list(mailbox);
        if (items.length >= min) return items;
        if (Date.now() > deadline) return items;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    },
  };
}
