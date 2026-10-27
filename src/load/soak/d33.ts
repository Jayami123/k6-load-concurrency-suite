// The D33 growth rule of the 120-minute soaks (owner decision D33, sustained form per D36): the growth test runs on the last 60
// minutes only, and it flags a product only when growth is sustained through both halves of that hour. Pure: it reuses the slope
// statistics of this folder.
import { soakSlope, type SoakPoint } from "./slope.ts";

export const D33_WINDOW_MIN = 60;
export const D33_HALF_MIN = 30;
export const D33_THEIL_SEN_PER_MIN = 0.5;

export interface D33Result {
  windowStartMs: number;
  n: number;
  firstHalfTheilSenPerMin: number | null; // minutes 60 to 90 of the run
  secondHalfTheilSenPerMin: number | null; // minutes 90 to 120 of the run
  flag: boolean; // D36: Theil–Sen >= 0.5 MB/min in BOTH halves of the last 60 minutes (sustained growth)
}

/**
 * The D33 growth check of one metric (RSS in MB) over the last 60 minutes of the run, in the sustained form of D36. The window ends
 * at endMs, the end of the run (the last telemetry sample, not the last RSS reading: a failed process read near the end must not shift
 * the window). Without endMs it ends at the last point. A single step followed by a plateau does not flag (heap or cache expansion).
 * A flag is "investigate", never a product verdict on its own.
 */
export function d33Growth(points: SoakPoint[], endMs?: number): D33Result {
  if (points.length === 0)
    return {
      windowStartMs: 0,
      n: 0,
      firstHalfTheilSenPerMin: null,
      secondHalfTheilSenPerMin: null,
      flag: false,
    };
  const runEndMs = endMs ?? Math.max(...points.map((p) => p.tMs));
  const windowStartMs = runEndMs - D33_WINDOW_MIN * 60_000;
  const midMs = windowStartMs + D33_HALF_MIN * 60_000;
  const window = points.filter((p) => p.tMs >= windowStartMs && p.tMs <= runEndMs);
  const first = window.filter((p) => p.tMs < midMs);
  const second = window.filter((p) => p.tMs >= midMs);
  const firstTs = soakSlope(first, windowStartMs, 0).theilSenPerMin;
  const secondTs = soakSlope(second, midMs, 0).theilSenPerMin;
  const sustained =
    firstTs !== null &&
    secondTs !== null &&
    firstTs >= D33_THEIL_SEN_PER_MIN &&
    secondTs >= D33_THEIL_SEN_PER_MIN;
  return {
    windowStartMs,
    n: window.length,
    firstHalfTheilSenPerMin: firstTs,
    secondHalfTheilSenPerMin: secondTs,
    flag: sustained,
  };
}
