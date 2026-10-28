import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const SIX_OBS_IDS = [
  "P6-OBS-MED-001",
  "P6-OBS-MED-002",
  "P6-OBS-CAL-005",
  "P6-OBS-DOC-007",
  "P6-OBS-DOC-003",
  "P6-OBS-DOC-006",
] as const;

const SEVERITY_AS_WRITTEN: Record<string, string> = {
  "P6-OBS-CAL-001": "low",
  "P6-OBS-CAL-002": "high",
  "P6-OBS-CAL-003": "low",
  "P6-OBS-DOC-001": "low",
  "P6-OBS-DOC-002": "medium",
  "P6-OBS-DOC-005": "medium",
  "P6-MED-RACE-011": "suspected (D40)",
  "P6-MED-RACE-008": "medium (proposed)",
  "P6-MED-RACE-009": "high (proposed)",
  "F-M3": "medium (proposed)",
  "F-M2": "medium (proposed)",
  "F-M4": "PRODUCT BUG, medium (owner label 2026-10-23)",
  "P6-CAL-RACE-006": "PRODUCT BUG (owner label, O6)",
  "P6-CAL-RACE-008": "PRODUCT BUG (owner label, O6)",
  "P6-CAL-RACE-007": "PRODUCT BUG (owner label, O6)",
  "P6-CAL-RACE-009": "PRODUCT BUG (owner label, O6)",
  "P6-OBS-TW-001": "PRODUCT BUG (owner label)",
  "P6-TW-RACE-004": "PRODUCT BUG (owner label)",
  "P6-OBS-MED-001": "product",
  "P6-OBS-MED-002": "PRODUCT BUG (SUSPECTED)",
  "P6-OBS-CAL-005": "PRODUCT BUG (SUSPECTED)",
  "P6-OBS-DOC-007": "PRODUCT BUG (SUSPECTED)",
  "P6-OBS-DOC-003": "low",
  "P6-OBS-DOC-006": "suspected",
};

type SchemaNode = {
  required?: string[];
  $defs?: { findingRow?: SchemaNode; [key: string]: SchemaNode | undefined };
  properties?: { evidence?: SchemaNode; [key: string]: SchemaNode | undefined };
};

type FindingRow = {
  id: string;
  aliases: string[];
  product: string;
  label: string;
  severity: string;
  upstream: string;
  tests: string[];
  evidence: { release: string; runIds: string[]; files: string[] };
  provenance: string;
};

function loadFindingsFile(): { schema: number; rows: FindingRow[] } {
  return JSON.parse(readFileSync("docs/findings.json", "utf8")) as {
    schema: number;
    rows: FindingRow[];
  };
}

function readmeFindingIds(readme: string): string[] {
  const start = readme.indexOf("### Known product bugs");
  assert.notEqual(start, -1, "README Known product bugs section");
  const after = readme.indexOf("\n### ", start + 1);
  const section = readme.slice(start, after === -1 ? undefined : after);
  const ids: string[] = [];
  for (const line of section.split("\n").filter((l) => l.startsWith("|") && !/^\|\s*-/.test(l))) {
    const idCell = line.split("|")[1]?.trim() ?? "";
    if (idCell === "ID") continue;
    const p6 = idCell.match(/P6-[A-Z0-9-]+/);
    const id = p6?.[0] ?? idCell.match(/F-[MC]\d+/)?.[0];
    assert.ok(id, `finding id in README cell: ${idCell}`);
    ids.push(id);
  }
  return ids;
}

function requiredOf(node: SchemaNode | undefined, label: string): string[] {
  assert.ok(Array.isArray(node?.required), `${label} has a required list`);
  return node!.required!;
}

function assertKeys(
  value: unknown,
  keys: string[],
  label: string,
): asserts value is Record<string, unknown> {
  assert.equal(typeof value, "object", label);
  assert.ok(value !== null, label);
  for (const key of keys) {
    assert.notEqual((value as Record<string, unknown>)[key], undefined, `${label} missing ${key}`);
  }
}

describe("findings.json schema", () => {
  it("findings.json matches docs/findings.schema.json", () => {
    const schema = JSON.parse(readFileSync("docs/findings.schema.json", "utf8")) as SchemaNode;
    const file = JSON.parse(readFileSync("docs/findings.json", "utf8")) as unknown;
    assertKeys(file, requiredOf(schema, "findings file"), "findings.json");
    assert.equal(file.schema, 1);
    assert.ok(Array.isArray(file.rows), "findings.json rows");
    const rowSchema = schema.$defs?.findingRow;
    const rowKeys = requiredOf(rowSchema, "finding row");
    const evidenceKeys = requiredOf(rowSchema?.properties?.evidence, "finding evidence");
    for (const row of file.rows as unknown[]) {
      assertKeys(row, rowKeys, "findings row");
      assertKeys(row.evidence, evidenceKeys, `findings row ${String(row.id)} evidence`);
      assert.equal(row.provenance, "docs/findings.json");
    }
  });

  it("every README Known product bugs ID exists in findings.json", () => {
    const readme = readFileSync("README.md", "utf8");
    const ids = new Set(loadFindingsFile().rows.map((row) => row.id));
    for (const id of readmeFindingIds(readme)) {
      assert.ok(ids.has(id), `README id ${id} exists in findings.json`);
    }
  });

  it("every findings.json id is unique", () => {
    const ids = loadFindingsFile().rows.map((row) => row.id);
    assert.deepEqual(ids, [...new Set(ids)]);
  });

  it("the six observation ids missing from the README are present", () => {
    const ids = new Set(loadFindingsFile().rows.map((row) => row.id));
    for (const id of SIX_OBS_IDS) {
      assert.ok(ids.has(id), `${id} is present`);
    }
  });

  it("P6-OBS-CAL-004 and P6-OBS-DOC-004 are absent", () => {
    const ids = new Set(loadFindingsFile().rows.map((row) => row.id));
    assert.equal(ids.has("P6-OBS-CAL-004"), false);
    assert.equal(ids.has("P6-OBS-DOC-004"), false);
  });

  it("CAL-RACE-006 upstream text is existing issue; our comment not posted", () => {
    const row = loadFindingsFile().rows.find((r) => r.id === "P6-CAL-RACE-006");
    assert.ok(row, "P6-CAL-RACE-006");
    assert.equal(row.upstream, "existing issue; our comment not posted (calcom/cal.diy#29815)");
  });

  it("OBS-TW-001 upstream text is not filed publicly: private security report", () => {
    const row = loadFindingsFile().rows.find((r) => r.id === "P6-OBS-TW-001");
    assert.ok(row, "P6-OBS-TW-001");
    assert.equal(row.upstream, "not filed publicly: private security report");
  });

  it("TW-RACE-004 upstream text is not filed publicly: private security report", () => {
    const row = loadFindingsFile().rows.find((r) => r.id === "P6-TW-RACE-004");
    assert.ok(row, "P6-TW-RACE-004");
    assert.equal(row.upstream, "not filed publicly: private security report");
  });

  it("severity strings are copied as written (medium (proposed) is not upgraded)", () => {
    const byId = new Map(loadFindingsFile().rows.map((row) => [row.id, row]));
    for (const [id, severity] of Object.entries(SEVERITY_AS_WRITTEN)) {
      const row = byId.get(id);
      assert.ok(row, id);
      assert.equal(row.severity, severity, id);
    }
    assert.equal(byId.get("P6-MED-RACE-008")?.severity, "medium (proposed)");
    assert.notEqual(byId.get("P6-MED-RACE-008")?.severity, "medium");
    assert.equal(byId.get("F-M3")?.severity, "medium (proposed)");
    assert.notEqual(byId.get("F-M3")?.severity, "medium");
  });
});
