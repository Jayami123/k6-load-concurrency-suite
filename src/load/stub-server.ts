import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";

export interface StubOptions {
  port: number;
  serviceMs: number;
  stallMs: number;
  periodMs: number;
  now?: () => number;
  /** Only 127.0.0.1 is accepted; any other value is a TEST BUG. */
  host?: string;
  /** Spins this many ms of wall time on the one Node thread before each answer (plan task 1 §6.3): a CPU-bound stub. */
  burnMs?: number;
}

/**
 * Pure: how long a request that arrives `elapsedMs` after the stub started waits. During the first stallMs of each period
 * it waits until the stall ends, plus serviceMs.
 */
export function stubDelayMs(
  elapsedMs: number,
  o: Pick<StubOptions, "serviceMs" | "stallMs" | "periodMs">,
): number {
  const phase = ((elapsedMs % o.periodMs) + o.periodMs) % o.periodMs;
  const stall = phase < o.stallMs ? o.stallMs - phase : 0;
  return stall + o.serviceMs;
}

/** GET /work answers 200 {"ok":true} after stubDelayMs. Binds 127.0.0.1 only; port 0 picks a free port. */
export function startStub(o: StubOptions): Promise<{ port: number; close(): Promise<void> }> {
  const host = o.host ?? "127.0.0.1";
  if (host !== "127.0.0.1") {
    return Promise.reject(new Error(`TEST BUG: the stub binds 127.0.0.1 only, got ${host}`));
  }
  const now = o.now ?? Date.now;
  const started = now();
  const server = createServer((req, res) => {
    if (req.method !== "GET" || req.url !== "/work") {
      res.writeHead(404).end();
      return;
    }
    if (o.burnMs) {
      const end = performance.now() + o.burnMs;
      while (performance.now() < end);
    }
    const delay = stubDelayMs(now() - started, o);
    setTimeout(() => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
    }, delay);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(o.port, host, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        close: () =>
          new Promise((done, fail) => {
            server.closeAllConnections();
            server.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
  });
}

// Standalone: node src/load/stub-server.ts <port> <serviceMs> <stallMs> <periodMs> [burnMs]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [port, serviceMs, stallMs, periodMs, burnMs] = process.argv.slice(2).map(Number);
  startStub({
    port: port ?? 18080,
    serviceMs: serviceMs ?? 25,
    stallMs: stallMs ?? 1500,
    periodMs: periodMs ?? 10000,
    burnMs: burnMs || undefined,
  }).then((stub) => console.log(`stub on 127.0.0.1:${stub.port}`));
}
