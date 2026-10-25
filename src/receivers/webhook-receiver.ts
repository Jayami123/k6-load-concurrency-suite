import { createHmac, timingSafeEqual } from "node:crypto";
import http, { type IncomingHttpHeaders } from "node:http";

export type WebhookDelivery = {
  receivedAt: number;
  path: string;
  host: string;
  event: string | null;
  body: unknown;
  secretMatches: boolean;
  /** The HTTP status the receiver answered (200 when no responder is given). */
  status?: number;
};

/** Chooses the status to answer one delivery. `index` is the delivery's position in the receiver's list. */
export type Responder = (delivery: WebhookDelivery, index: number) => number;

/** Decides whether a delivery carries the subscriber secret. Pure. Never returns or logs the secret. */
export type SecretCheck = (headers: IncomingHttpHeaders, rawBody: string) => boolean;

/** Documenso: the secret comes back verbatim in one header. `null` expected means "no header". */
export function headerSecretCheck(header: string, expectedSecret: string | null): SecretCheck {
  return (headers) => {
    const got = headers[header];
    return expectedSecret === null ? got === undefined : got === expectedSecret;
  };
}

/** Cal: `x-cal-signature-256` is the lower-case hex HMAC-SHA256 of the raw body with the subscriber secret (step 0, section 3.7). */
export function hmacSignatureCheck(secret: string): SecretCheck {
  return (headers, rawBody) => {
    const got = headers["x-cal-signature-256"];
    if (typeof got !== "string") return false;
    const want = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
    const have = Buffer.from(got);
    return have.length === want.length && timingSafeEqual(have, want);
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

/** -008: 500 for the first delivery of each event key, 200 afterwards. `keyOf` names the key; the state is per receiver. */
export function failFirstPerEvent(keyOf: (d: WebhookDelivery) => string): Responder {
  const seen = new Set<string>();
  return (d) => {
    const key = keyOf(d);
    if (seen.has(key)) return 200;
    seen.add(key);
    return 500;
  };
}

/** Starts a loopback receiver on a random port; each delivery is checked with `opts.check`, then answered with `opts.respond` (default 200). */
export async function startWebhookReceiver(opts: {
  publicHost: string;
  check: SecretCheck;
  respond?: Responder;
}) {
  const deliveries: WebhookDelivery[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c.toString("utf8")));
    req.on("end", () => {
      const d = parseDelivery({
        headers: req.headers,
        rawBody: raw,
        check: opts.check,
        receivedAt: Date.now(),
        path: req.url ?? "",
      });
      const status = opts.respond ? opts.respond(d, deliveries.length) : 200;
      deliveries.push({ ...d, status });
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(status === 200 ? '{"ok":true}' : '{"ok":false}');
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
