import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface VerdictInput {
  runId: string;
  caseId: string;
  outcome: string;
  validity: string;
  reasons: string[];
  knownFail?: string; // stages.reconcile.data.knownFail
  leakedCanceledOrders?: number;
  suspectedBugCount?: number;
  githubRunId?: string;
}

export interface WalkedVerdict {
  dir: string; // parent of verdict.json; chart-main.html lives here when present
  verdict: VerdictInput;
}

/** Recursively finds verdict.json. caseId = grandparent dir, runId = parent dir. Also reads knownFail. */
export function walkVerdicts(root: string, githubRunId: string): WalkedVerdict[] {
  const out: WalkedVerdict[] = [];
  const visit = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) visit(p);
      else if (name === "verdict.json") {
        const v = JSON.parse(readFileSync(p, "utf8"));
        const knownFail =
          typeof v.stages?.reconcile?.data?.knownFail === "string"
            ? v.stages.reconcile.data.knownFail
            : undefined;
        const leaked =
          typeof v.stages?.reconcile?.data?.leakedCanceledOrders === "number"
            ? v.stages.reconcile.data.leakedCanceledOrders
            : undefined;
        out.push({
          dir: path.dirname(p),
          verdict: {
            runId: path.basename(path.dirname(p)),
            caseId: path.basename(path.dirname(path.dirname(p))),
            outcome: String(v.outcome ?? ""),
            validity: String(v.validity?.verdict ?? "INVALID"),
            reasons: (v.reasons ?? []).map(String),
            knownFail,
            leakedCanceledOrders: leaked,
            githubRunId,
          },
        });
      }
    }
  };
  if (existsSync(root)) visit(root);
  return out;
}
