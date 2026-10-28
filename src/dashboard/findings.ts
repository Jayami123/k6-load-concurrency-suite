import { readFileSync } from "node:fs";

export interface FindingRow {
  id: string;
  aliases: string[];
  product: string;
  label: string;
  severity: string;
  upstream: string;
  tests: string[];
  evidence: { release: string; runIds: string[]; files: string[] };
  provenance: string; // always "docs/findings.json"; commit sha is appended at render
}
export interface FindingsFile {
  schema: 1;
  rows: FindingRow[];
}

/** Purpose: load and validate the committed findings file. Throws TEST BUG on schema miss. */
export function loadFindings(file: string): FindingsFile {
  const j = JSON.parse(readFileSync(file, "utf8")) as FindingsFile;
  if (j.schema !== 1 || !Array.isArray(j.rows))
    throw new Error("TEST BUG: findings.json schema is not 1 or rows is missing");
  for (const row of j.rows) {
    for (const key of [
      "id",
      "aliases",
      "product",
      "label",
      "severity",
      "upstream",
      "tests",
      "evidence",
      "provenance",
    ] as const) {
      if (row[key] === undefined) throw new Error(`TEST BUG: findings row missing ${key}`);
    }
    if (row.provenance !== "docs/findings.json")
      throw new Error("TEST BUG: findings row provenance must be docs/findings.json");
  }
  return j;
}
