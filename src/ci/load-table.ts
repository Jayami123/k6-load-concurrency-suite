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
  return [
    "## LOAD runs",
    "",
    "| case | profile | outcome | validity | requests | dropped | peak VUs | k6 cores (avg) | invalid reasons |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "Valid runs only count towards medians (P6-RULE-005). Label: functional load, not capacity.",
    "",
  ].join("\n");
}
