// Job-summary rows of the pipeline (plan task 9 §6.3). Numbers only.
import type { LagSummary, Stage } from "./pipeline-lag.ts";

/** One row per stage: p50, p95 and max lag (ms), missing and duplicated counts; the drain time is the last line. */
export function formatPipelineRows(
  summary: LagSummary,
  drain: { drained: boolean; drainMs: number },
): string[] {
  const stages: Stage[] = ["seal", "webhookJob", "webhookCall", "receiver", "emailJob"];
  const rows = [
    "| stage | p50 ms | p95 ms | max ms | missing | duplicated |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  const dup: Record<string, number> = {
    seal: summary.duplicated.seal ?? 0,
    webhookCall: 0,
    webhookJob: summary.duplicated.webhookJob ?? 0,
    receiver: summary.duplicated.receiverOk ?? 0,
    emailJob: summary.duplicated.emailJob ?? 0,
  };
  for (const s of stages) {
    rows.push(
      `| ${s} | ${summary.p50[s] ?? "-"} | ${summary.p95[s] ?? "-"} | ${summary.max[s] ?? "-"} | ${summary.missing[s]} | ${dup[s] ?? 0} |`,
    );
  }
  rows.push(`drain: ${drain.drained ? "drained" : "NOT drained"} in ${drain.drainMs} ms`);
  return rows;
}
