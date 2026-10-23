import http, { type IncomingHttpHeaders } from "node:http";

export type WebhookDelivery = {
  receivedAt: number;
  path: string;
  host: string;
  event: string | null;
  body: unknown;
  secretMatches: boolean;
};

/** Decides whether a delivery carries the subscriber secret. Pure. Never returns or logs the secret. */
export type SecretCheck = (headers: IncomingHttpHeaders, rawBody: string) => boolean;

/** Documenso: the secret comes back verbatim in one header. `null` expected means "no header". */
export function headerSecretCheck(header: string, expectedSecret: string | null): SecretCheck {
  return (headers) => {
    const got = headers[header];
    return expectedSecret === null ? got === undefined : got === expectedSecret;
  };
}

/** Pure. Never returns or logs the secret; only whether it matched. */
export function parseDelivery(input: {
  headers: IncomingHttpHeaders;
  rawBody: string;
  check: SecretCheck;
  receivedAt: number;
  path: string;
}): WebhookDelivery {
  let body: unknown = null;
  try {
    body = JSON.parse(input.rawBody);
  } catch {
    body = null;
  }
  const event =
    body && typeof body === "object" && typeof (body as { event?: unknown }).event === "string"
      ? (body as { event: string }).event
      : null;
  return {
    receivedAt: input.receivedAt,
    path: input.path,
    host: String(input.headers.host ?? ""),
    event,
    body,
    secretMatches: input.check(input.headers, input.rawBody),
  };
}

export async function startWebhookReceiver(opts: { publicHost: string; check: SecretCheck }) {
  const deliveries: WebhookDelivery[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c.toString("utf8")));
    req.on("end", () => {
      deliveries.push(
        parseDelivery({
          headers: req.headers,
          rawBody: raw,
          check: opts.check,
          receivedAt: Date.now(),
          path: req.url ?? "",
        }),
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  return {
    port,
    url: `http://${opts.publicHost}:${port}/hook`,
    deliveries,
    async waitForDeliveries(n: number, timeoutMs = 10_000): Promise<WebhookDelivery[]> {
      const deadline = Date.now() + timeoutMs;
      while (deliveries.length < n && Date.now() < deadline)
        await new Promise((r) => setTimeout(r, 100));
      return [...deliveries];
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
