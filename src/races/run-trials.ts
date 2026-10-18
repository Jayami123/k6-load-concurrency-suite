export async function runTrials<T>(
  trials: number,
  trialFn: (trial: number) => Promise<T>,
): Promise<Array<{ trial: number; ok: boolean; value?: T; error?: string }>> {
  const out: Array<{ trial: number; ok: boolean; value?: T; error?: string }> = [];
  for (let trial = 1; trial <= trials; trial++) {
    try {
      const value = await trialFn(trial);
      out.push({ trial, ok: true, value });
    } catch (err) {
      out.push({ trial, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}
