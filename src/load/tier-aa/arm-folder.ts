// The run folder of one A/A arm (tier-aa.yml). The load runner writes an arm as <out>/P6-MED-LOAD-002/<runId>/ (the case folder,
// then one run folder). Exactly one run folder is accepted: zero or more than one is an error that names the arm.
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export const ARM_CASE_DIR = "P6-MED-LOAD-002";

export function armRunFolder(armDir: string): string {
  const arm = path.basename(armDir);
  const caseDir = path.join(armDir, ARM_CASE_DIR);
  const runs = existsSync(caseDir)
    ? readdirSync(caseDir)
        .filter((name) => statSync(path.join(caseDir, name)).isDirectory())
        .sort()
    : [];
  if (runs.length === 0)
    throw new Error(`aa-flags: arm ${arm} has no run folder under ${ARM_CASE_DIR}/`);
  if (runs.length > 1)
    throw new Error(
      `aa-flags: arm ${arm} has ${runs.length} run folders under ${ARM_CASE_DIR}/ (expected one): ${runs.join(", ")}`,
    );
  return path.join(caseDir, runs[0] ?? "");
}
