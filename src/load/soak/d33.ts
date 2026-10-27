// The D33 growth rule of the 120-minute soaks (owner decision D33): the growth test runs on the last 60 minutes only, so an early
// ramp that is released before then does not count. Pure: it reuses the slope and plateau statistics of this folder.
import { plateauRatio } from "./plateau.ts";
import { soakSlope, type SoakPoint } from "./slope.ts";

export const D33_WINDOW_MIN = 60;
export const D33_THEIL_SEN_PER_MIN = 0.5;
export const D33_PLATEAU_RATIO = 1.02;

export interface D33Result {
  windowStartMs: number;
  n: number;
  theilSenPerMin: number | null;
  stepsOver: number;
  plateauRatio: number | null;
  flag: boolean; // Theil–Sen >= 0.5 MB/min AND (a step, or a plateau ratio above 1.02)
}

/**
 * The D33 growth check of one metric (RSS in MB) over the last 60 minutes of the run. The window ends at endMs, the end of the run
 * (the last telemetry sample, not the last RSS reading: a failed process read near the end must not shift the window). Without
 * endMs it ends at the last point. A flag is "investigate", never a product verdict on its own.
 */
export function d33Growth(points: SoakPoint[], endMs?: number): D33Result {
  if (points.length === 0)
    return {
      windowStartMs: 0,
      n: 0,
      theilSenPerMin: null,
      stepsOver: 0,
      plateauRatio: null,
      flag: false,
    };
  const runEndMs = endMs ?? Math.max(...points.map((p) => p.tMs));
  const windowStartMs = runEndMs - D33_WINDOW_MIN * 60_000;
  const window = points.filter((p) => p.tMs >= windowStartMs);
  const slope = soakSlope(window, windowStartMs, 0);
  const plateau = plateauRatio(window, windowStartMs, 0);
  const growing = slope.theilSenPerMin !== null && slope.theilSenPerMin >= D33_THEIL_SEN_PER_MIN;
  const plateauUp = plateau.ratio !== null && plateau.ratio > D33_PLATEAU_RATIO;
  return {
    windowStartMs,
    n: slope.n,
    theilSenPerMin: slope.theilSenPerMin,
    stepsOver: slope.stepsOver,
    plateauRatio: plateau.ratio,
    flag: growing && (slope.stepsOver > 0 || plateauUp),
  };
}
