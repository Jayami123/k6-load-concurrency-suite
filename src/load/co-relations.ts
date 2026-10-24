import { plannedIterations } from "../../k6/lib/pure/sizing.js";

export interface CoRun {
  requests: number;
  dropped: number;
  p95Ms: number;
}

export interface CoInput {
  open: CoRun;
  closed: CoRun;
  undersized: CoRun;
  rate: number;
  durationSec: number;
  serviceMs: number;
}

/** Margins of plan §6.5 and §7. Probe values in comments. Changed only with new probe data and an owner decision. */
export const CO_MARGINS = {
  openKeepsRate: 0.97, // open.requests + open.dropped >= 0.97 x planned; probe: 1201 / 1200
  openDropsAtMost: 0.05, // sized open: dropped <= 5 % of planned; probe: 0
  closedSendsFewer: 0.95, // closed.requests <= 0.95 x open.requests; probe: 0.84
  closedP95Factor: 3, // closed.p95 x 3 <= open.p95; probe: 26 x 40
  openShowsStallFactor: 5, // open.p95 >= 5 x serviceMs; probe: 1020 >= 125
  undersizedDropsAtLeast: 0.05, // undersized.dropped >= 5 % of planned; probe: 170 of 1200 = 14 %
} as const;

/** Returns one violation line per broken relation. Empty = the self-test shows coordinated omission the way the roadmap asks. */
export function evaluateCoordinatedOmission(input: CoInput, margins = CO_MARGINS): string[] {
  const planned = plannedIterations(input.rate, input.durationSec);
  const out: string[] = [];
  if (input.open.requests + input.open.dropped < margins.openKeepsRate * planned)
    out.push(
      `R1 open keeps the arrival rate: ${input.open.requests + input.open.dropped} < ${margins.openKeepsRate} x ${planned}`,
    );
  if (input.open.dropped > margins.openDropsAtMost * planned)
    out.push(
      `R2 sized open does not drop: dropped ${input.open.dropped} > ${margins.openDropsAtMost} x ${planned}`,
    );
  if (input.closed.requests > margins.closedSendsFewer * input.open.requests)
    out.push(
      `R3 closed sends fewer requests: ${input.closed.requests} > ${margins.closedSendsFewer} x ${input.open.requests}`,
    );
  if (input.closed.p95Ms * margins.closedP95Factor > input.open.p95Ms)
    out.push(
      `R4 closed reports a lower p95: ${input.closed.p95Ms} x ${margins.closedP95Factor} > ${input.open.p95Ms}`,
    );
  if (input.open.p95Ms < margins.openShowsStallFactor * input.serviceMs)
    out.push(
      `R5 open shows the stall: p95 ${input.open.p95Ms} < ${margins.openShowsStallFactor} x ${input.serviceMs}`,
    );
  if (input.undersized.dropped < margins.undersizedDropsAtLeast * planned)
    out.push(
      `R6 under-sized open reports drops: dropped ${input.undersized.dropped} < ${margins.undersizedDropsAtLeast} x ${planned}`,
    );
  return out;
}
