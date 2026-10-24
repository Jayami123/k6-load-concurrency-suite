/** The share of first attempts that must time out for a run to prove anything (plan §6.3; probe: Medusa 21 of 21). */
export const STORM_SHARE = 0.5;

export interface StormCounters {
  intents: number;
  firstTimeouts: number;
  retries: number;
}

export interface StormJudgement {
  ok: boolean;
  kind?: "TEST BUG";
  detail: string;
}

/**
 * Judges that the storm happened: at least half of the first attempts timed out, and every timed-out intent was retried.
 * A run without a storm has proven nothing, so it cannot PASS (plan §6.3). Pure; the detail is built from counts only.
 */
export function judgeStorm(c: StormCounters): StormJudgement {
  const share = c.intents > 0 ? c.firstTimeouts / c.intents : 0;
  if (c.intents > 0 && share >= STORM_SHARE && c.retries >= c.firstTimeouts) {
    return {
      ok: true,
      detail: `${c.firstTimeouts} of ${c.intents} first attempts timed out, ${c.retries} retries sent`,
    };
  }
  return {
    ok: false,
    kind: "TEST BUG",
    detail: `no storm (${c.firstTimeouts} of ${c.intents} first attempts timed out, ${c.retries} retries)`,
  };
}
