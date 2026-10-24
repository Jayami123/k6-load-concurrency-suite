// CLI of the LOAD runner: node scripts/load/run-load.ts --case P6-X-LOAD-001 [--profile pr|full] [--out results/load]
import { CASES } from "../../src/load/cases.ts";
import { loadRepoEnv } from "../../src/load/env.ts";
import { runLoad } from "../../src/load/runner.ts";
import type { LoadProfileName } from "../../src/load/types.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const caseId = arg("--case");
const profile = (arg("--profile") ?? "pr") as LoadProfileName;
const caseDef = caseId ? CASES[caseId] : undefined;
if (!caseDef || (profile !== "pr" && profile !== "full")) {
  console.error(
    `unknown case or profile. Cases: ${Object.keys(CASES).join(", ")}; profiles: pr, full`,
  );
  process.exit(2);
}

loadRepoEnv();
const result = await runLoad(caseDef, { profile, outRoot: arg("--out") });
console.log(`${caseDef.id} ${result.outcome} ${result.verdictPath}`);
process.exit(result.exitCode);
