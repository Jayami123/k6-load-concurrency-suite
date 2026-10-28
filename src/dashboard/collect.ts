import { walkVerdicts, type VerdictInput } from "./verdicts.ts";
import { readKneeCurves, type KneeCurve } from "./knee/read-curves.ts";
import { readSoakTrends, type SoakTrend } from "./soak/read-trends.ts";
import { readAaSeries, type AaSeries } from "./gate/read-aa.ts";
import { readAbGate, type AbGate } from "./gate/read-ab.ts";
import { readRaceTallies, raceVerdictInputs, type RaceTally } from "./races/read-tallies.ts";

export interface CollectedEvidence {
  verdicts: VerdictInput[];
  kneeCurves: KneeCurve[];
  soakTrends: SoakTrend[];
  aa: AaSeries[];
  ab: AbGate[];
  races: RaceTally[];
}

/** Walks one unzipped evidence dir. Stubs return empty arrays until their PR fills them. */
export function collectFromArtefactDir(dir: string, githubRunId: string): CollectedEvidence {
  const races = readRaceTallies(dir, githubRunId);
  return {
    // Race histograms have no verdict.json (V6). PR-D stub raceVerdictInputs returns [].
    // PR-H fills it so computeCard sees promo/cancel/invariants cases.
    verdicts: [
      ...walkVerdicts(dir, githubRunId).map((w) => w.verdict),
      ...raceVerdictInputs(races),
    ],
    kneeCurves: readKneeCurves(dir, githubRunId),
    soakTrends: readSoakTrends(dir, githubRunId),
    aa: readAaSeries(dir, githubRunId),
    ab: readAbGate(dir, githubRunId),
    races,
  };
}
