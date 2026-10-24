import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { findHits } from "../../scripts/evidence-token-scan.mjs";
import { plannedIterations } from "../../k6/lib/pure/sizing.js";
import { VALIDITY_LIMITS } from "./validity.ts";
import type { LoadCase, LoadProfile, LoadProfileName, RunMeta } from "./types.ts";

const SHA = /^[0-9a-f]{40}$/;
const PUBLISH_EVENTS = ["push", "schedule", "workflow_dispatch"];
const PRODUCT_FOLDERS = {
  medusa: "medusa-dtc-starter",
  cal: "cal",
  documenso: "documenso",
} as const;

/** Pure: the harness tag in package.json's "qa-portfolio-harness" entry (github:Owner/repo#vX.Y.Z). */
export function parseHarnessPin(packageJsonText: string): string {
  const spec =
    (JSON.parse(packageJsonText) as { dependencies?: Record<string, string> }).dependencies?.[
      "qa-portfolio-harness"
    ] ?? "";
  return /#(v\d+\.\d+\.\d+)$/.exec(spec)?.[1] ?? "unknown";
}

function gitHead(productsRoot: string, folder: string): string | undefined {
  try {
    const sha = execFileSync("git", ["-C", path.join(productsRoot, folder), "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return SHA.test(sha) ? sha : undefined;
  } catch {
    return undefined;
  }
}

export interface BuildRunMetaInput {
  caseDef: LoadCase;
  profileName: LoadProfileName;
  profile: LoadProfile;
  runId: string;
  startedAt: Date;
  env: NodeJS.ProcessEnv;
  k6Version: string;
  os?: { nproc: number; memTotalMb: number; platform: string; arch: string; node: string };
  readHarnessPin?: () => string;
  gitSha?: (folder: string) => string | undefined;
}

/** Builds run-meta.json content. Only the environment and version fields are read; no secret is copied. */
export function buildRunMeta(input: BuildRunMetaInput): RunMeta {
  const { env } = input;
  const osInfo = input.os ?? {
    nproc: os.cpus().length,
    memTotalMb: Math.round(os.totalmem() / 1048576),
    platform: os.platform(),
    arch: os.arch(),
    node: process.version,
  };
  const ci = env.GITHUB_ACTIONS === "true";
  const products: RunMeta["software"]["products"] = {};
  for (const [name, folder] of Object.entries(PRODUCT_FOLDERS) as Array<
    [keyof typeof PRODUCT_FOLDERS, string]
  >) {
    const fromEnv =
      env[`${name === "medusa" ? "MEDUSA" : name === "cal" ? "CAL" : "DOCUMENSO"}_REF`];
    const sha =
      fromEnv && SHA.test(fromEnv)
        ? fromEnv
        : (input.gitSha ?? ((f: string) => gitHead(env.PRODUCTS_ROOT ?? "products", f)))(folder);
    if (sha) products[name] = sha;
  }
  const readPin =
    input.readHarnessPin ?? (() => parseHarnessPin(readFileSync("package.json", "utf8")));
  const planned = plannedIterations(input.profile.rate, input.profile.durationSec);
  return {
    schema: 1,
    caseId: input.caseDef.id,
    runId: input.runId,
    profile: input.profileName,
    label: "functional load, not capacity",
    rate: input.profile.rate,
    durationSec: input.profile.durationSec,
    plannedIterations: planned,
    startedAt: input.startedAt.toISOString(),
    environment: {
      kind: ci ? "github-actions" : "local",
      ...(ci
        ? {
            event: env.GITHUB_EVENT_NAME,
            workflow: env.GITHUB_WORKFLOW,
            ref: env.GITHUB_REF_NAME,
            sha: env.GITHUB_SHA,
            runUrl: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
            attempt: Number(env.GITHUB_RUN_ATTEMPT ?? 1),
          }
        : {}),
      runnerImage: ci ? (env.ImageOS ?? "unknown") : "local",
      imageVersion: env.ImageVersion ?? "unknown",
      runnerOs: env.RUNNER_OS ?? osInfo.platform,
      runnerArch: env.RUNNER_ARCH ?? osInfo.arch,
      nproc: osInfo.nproc,
      memTotalMb: osInfo.memTotalMb,
    },
    software: {
      k6: input.k6Version,
      harness: readPin(),
      node: osInfo.node,
      products,
    },
    limits: { ...VALIDITY_LIMITS },
  };
}

/** RULE-003: only a GitHub Actions run on main (push, schedule or workflow_dispatch), with a known image and the product SHA of its product, may be published. */
export function isPublishable(meta: RunMeta): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const e = meta.environment;
  if (e.kind !== "github-actions") reasons.push("not a GitHub Actions run");
  if (e.kind === "github-actions" && !PUBLISH_EVENTS.includes(e.event ?? ""))
    reasons.push(`event ${e.event ?? "missing"} is not publishable`);
  if (e.kind === "github-actions" && e.ref !== "main")
    reasons.push(`ref ${e.ref ?? "missing"} is not main`);
  if (e.imageVersion === "unknown") reasons.push("runner image version unknown");
  if (!meta.caseId.startsWith("P6-X-") && Object.keys(meta.software.products).length === 0)
    reasons.push("no product SHA recorded");
  return { ok: reasons.length === 0, reasons };
}

/** Throws on a missing field or a secret-shaped value (the token scanner's own patterns). */
export function validateRunMeta(value: unknown): RunMeta {
  const m = value as RunMeta;
  for (const key of ["caseId", "runId", "startedAt"] as const) {
    if (typeof m?.[key] !== "string" || m[key].length === 0)
      throw new Error(`run-meta: missing ${key}`);
  }
  if (m.schema !== 1) throw new Error("run-meta: schema must be 1");
  if (!m.environment || !m.software) throw new Error("run-meta: missing environment or software");
  const hits = findHits(JSON.stringify(value)) as number[];
  if (hits.length > 0)
    throw new Error("run-meta: a secret-shaped value was found (values not printed)");
  return m;
}
