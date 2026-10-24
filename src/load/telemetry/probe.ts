// A timed health probe of the product (plan task 5 §6.1 "timed health probe"). Records the latency, never the body.
export interface ProbeResult {
  ok: boolean;
  status?: number;
  ms: number;
}

export async function timedProbe(
  url: string,
  fetchFn: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<ProbeResult> {
  const t0 = now();
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(5_000) });
    await res.arrayBuffer();
    return { ok: res.status === 200, status: res.status, ms: now() - t0 };
  } catch {
    return { ok: false, ms: now() - t0 };
  }
}
