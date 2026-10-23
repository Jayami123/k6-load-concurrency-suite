import { expect } from "@playwright/test";
import type { RaceAttemptResult, RaceHistogram } from "../../../src/races/types.ts";

/**
 * The guards every Twenty race case asserts before its oracle: every trial ran (setup, sign-up, mail, token, hash read),
 * every parallel burst overlapped (D15), and the leak check found no company row left with the run prefix (D16).
 * A failure here is red and is never inside test.fail().
 */
export function guards(
  trials: Array<{ trial: number; ok: boolean; value?: RaceAttemptResult; error?: string }>,
  histogram: RaceHistogram,
): void {
  expect(
    trials
      .filter((t) => !t.ok || t.value?.valid === false)
      .map((t) => `trial ${t.trial}: ${t.error ?? "invalid spread"}`),
    "setup or run error in a trial (TEST BUG)",
  ).toEqual([]);
  expect(
    trials.filter((t) => t.value?.oracle.overlapped !== true).map((t) => t.trial),
    "trials whose requests did not overlap (D15)",
  ).toEqual([]);
  expect(
    histogram.oracle.companyRowsLeft,
    "leak check: company rows left with the run prefix",
  ).toBe(0);
}
