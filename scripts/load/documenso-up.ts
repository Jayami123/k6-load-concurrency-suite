// Starts the Documenso harness stack for one load case, with the rate limiter on or bypassed as that case needs.
// Usage: node scripts/load/documenso-up.ts <caseId>
import { spawnSync } from "node:child_process";
import { documensoBypassFor } from "../../src/load/documenso-bypass.ts";

const caseId = process.argv[2];
if (!caseId) {
  console.error("usage: node scripts/load/documenso-up.ts <caseId>");
  process.exit(2);
}
const bypass = documensoBypassFor(caseId);
console.log(`Documenso for ${caseId}: DANGEROUS_BYPASS_RATE_LIMITS=${bypass}`);
const result = spawnSync(process.execPath, ["scripts/harness.mjs", "up", "documenso"], {
  stdio: "inherit",
  env: { ...process.env, DANGEROUS_BYPASS_RATE_LIMITS: bypass },
});
process.exit(result.status ?? 1);
