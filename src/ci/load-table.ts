/** One row per verdict.json: case, profile, outcome, validity, requests, dropped, peak VUs, k6 cores (average), invalid codes. No latency is shown (P6-RULE-005). */
export function formatLoadTable(files: Array<{ path: string; verdict: unknown }>): string {
  const rows = files.map(({ verdict }) => {
    const v = verdict as {
      caseId?: string;
      profile?: string;
      outcome?: string;
      validity?: { verdict?: string; reasons?: Array<{ code: string }> };
      k6?: Array<{
        requests?: number;
        dropped?: number;
        vusMax?: number;
        resources?: { k6CoresAvg?: number };
      }>;
    };
    const k = v.k6?.[0];
    const codes = (v.validity?.reasons ?? []).map((r) => r.code).join(", ") || "none";
    return `| ${v.caseId ?? "?"} | ${v.profile ?? "?"} | ${v.outcome ?? "?"} | ${v.validity?.verdict ?? "n/a"} | ${k?.requests ?? "n/a"} | ${k?.dropped ?? "n/a"} | ${k?.vusMax ?? "n/a"} | ${k?.resources?.k6CoresAvg?.toFixed(2) ?? "n/a"} | ${codes} |`;
  });
  // Knee runs (plan task 1 §6.4): the knee stage writes its verdict into the run's stages; a knee block lists each of them.
  const knees = files.flatMap(({ verdict }) => {
    const stages =
      (verdict as { stages?: Record<string, { data?: { knee?: unknown } }> }).stages ?? {};
    return Object.values(stages).flatMap((stage) => {
      const list = Array.isArray(stage?.data?.knee)
        ? (stage.data.knee as Array<Record<string, unknown>>)
        : [];
      return list.map((k) => {
        const range =
          typeof k.lowerRate === "number" && typeof k.upperRate === "number"
            ? `between ${k.lowerRate} and ${k.upperRate} iterations/s`
            : "no range";
        return `| ${String(k.caseId ?? "?")} | ${String(k.verdict ?? "?")} | ${range} | ${String(k.firstSaturated ?? "none_observed")} |`;
      });
    });
  });
  const kneeBlock =
    knees.length === 0
      ? []
      : [
          "",
          "## Knee runs",
          "",
          "| case | verdict | knee range | first saturated |",
          "|---|---|---|---|",
          ...knees,
          "",
          "A knee range is environment-bound, not capacity.",
        ];
  return [
    "## LOAD runs",
    "",
    "| case | profile | outcome | validity | requests | dropped | peak VUs | k6 cores (avg) | invalid reasons |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "Valid runs only count towards medians (P6-RULE-005). Label: functional load, not capacity.",
    ...kneeBlock,
    "",
  ].join("\n");
}
