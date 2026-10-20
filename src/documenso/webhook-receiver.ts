import http, { type IncomingHttpHeaders } from "node:http";

export type WebhookDelivery = {
  receivedAt: number;
  path: string;
  host: string;
  event: string | null;
  body: unknown;
  secretMatches: boolean;
};

/** Pure. Never returns or logs the secret; only whether it matched. */
export function parseDelivery(input: {
  headers: IncomingHttpHeaders;
  rawBody: string;
  expectedSecret: string | null;
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
  const got = input.headers["x-documenso-secret"];
  return {
    receivedAt: input.receivedAt,
    path: input.path,
    host: String(input.headers.host ?? ""),
    event,
    body,
    secretMatches: input.expectedSecret === null ? got === undefined : got === input.expectedSecret,
  };
}

export async function startWebhookReceiver(opts: {
  publicHost: string;
  expectedSecret: string | null;
}) {
  const deliveries: WebhookDelivery[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c.toString("utf8")));
    req.on("end", () => {
      deliveries.push(
        parseDelivery({
          headers: req.headers,
          rawBody: raw,
          expectedSecret: opts.expectedSecret,
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
