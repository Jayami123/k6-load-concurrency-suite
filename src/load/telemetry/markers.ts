import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

/** 127.0.0.1 marker server on a random port. GET /clock answers the server's clock, Date.now() + skewMs. */
export async function startMarkerServer(
  opts: { skewMs?: number } = {},
): Promise<{ url: string; close(): Promise<void> }> {
  const skew = opts.skewMs ?? 0;
  const server = createServer((req, res) => {
    if (req.url === "/clock") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ serverNowMs: Date.now() + skew }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/clock`,
    close: () =>
      new Promise((done, fail) => {
        server.closeAllConnections();
        server.close((err) => (err ? fail(err) : done()));
      }),
  };
}

/** The k6 side writes p6_clock_offset_start_ms and p6_clock_offset_end_ms as Trend metrics; their avg is read here. */
export function offsetsFromSummary(summary: unknown): { startMs?: number; endMs?: number } {
  const metrics =
    (summary as { metrics?: Record<string, { avg?: number }> } | undefined)?.metrics ?? {};
  const start = metrics.p6_clock_offset_start_ms?.avg;
  const end = metrics.p6_clock_offset_end_ms?.avg;
  return {
    startMs: typeof start === "number" ? start : undefined,
    endMs: typeof end === "number" ? end : undefined,
  };
}

/** Worst absolute offset against the limit. No offsets measured is ok, with the reason "marker not measured" (never a fabricated number). */
export function judgeSkew(
  offsets: { startMs?: number; endMs?: number },
  limitMs: number,
): { skewMs?: number; ok: boolean; reason?: string } {
  const values = [offsets.startMs, offsets.endMs].filter((v): v is number => v !== undefined);
  if (values.length === 0) return { skewMs: undefined, ok: true, reason: "marker not measured" };
  const worst = values.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a));
  return { skewMs: worst, ok: Math.abs(worst) <= limitMs };
}
