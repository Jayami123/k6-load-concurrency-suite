import type { RaceRequestResult } from "./types.ts";

export function summariseBody(status: number | null, body: string): string {
  const collapsed = body.replace(/\s+/g, " ").trim();
  const capped = collapsed.length > 200 ? `${collapsed.slice(0, 200)}…` : collapsed;
  const prefix = status === null ? "error" : String(status);
  return `${prefix}: ${capped}`;
}

export function dispatchSpreadMs(starts: number[]): number {
  if (starts.length === 0) return 0;
  return Math.max(...starts) - Math.min(...starts);
}

export async function fireTogether(
  n: number,
  makeRequest: (index: number) => Promise<{ status: number; body: string }>,
  options?: { warm?: () => Promise<unknown> },
): Promise<{ requests: RaceRequestResult[]; dispatchSpreadMs: number }> {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error("TEST BUG: fireTogether n must be integer >= 1");
  }

  if (options?.warm) {
    await Promise.all(Array.from({ length: n }, () => options.warm!()));
  }

  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });

  const starts: number[] = Array.from({ length: n }, () => 0);
  const pending = Array.from({ length: n }, (_, i) =>
    gate.then(async (): Promise<RaceRequestResult> => {
      const startedAtMs = performance.now();
      starts[i] = startedAtMs;
      try {
        const { status, body } = await makeRequest(i);
        return {
          index: i,
          status,
          bodySummary: summariseBody(status, body),
          startedAtMs,
          endedAtMs: performance.now(),
        };
      } catch (err) {
        return {
          index: i,
          status: null,
          bodySummary: summariseBody(null, err instanceof Error ? err.message : String(err)),
          startedAtMs,
          endedAtMs: performance.now(),
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  await Promise.resolve();
  release();
  const requests = await Promise.all(pending);
  return { requests, dispatchSpreadMs: dispatchSpreadMs(starts) };
}
