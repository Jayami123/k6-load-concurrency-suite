import { spawn } from "node:child_process";
import { closeSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { K6RunResult, K6RunSpec } from "./types.ts";

/** Config keys whose values are never written to an artifact (the publishable key, tokens, passwords, connection strings). */
const SECRET_KEY = /key|token|secret|password|passwd|dburl|databaseurl/i;

/**
 * The config as it may be uploaded: every value under a secret-looking key is replaced by "<redacted>", recursively. Pure.
 * The k6 child reads the full config from a temporary file outside the results, so the case still gets its publishable key.
 */
export function redactForArtifact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForArtifact);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] =
        SECRET_KEY.test(key) && typeof v !== "object" ? "<redacted>" : redactForArtifact(v);
    }
    return out;
  }
  return value;
}

export interface RunK6Input {
  binary?: string;
  spec: K6RunSpec;
  outDir: string;
  config: Record<string, unknown>;
  env: NodeJS.ProcessEnv;
  /** Values from setup. Forwarded to the child only when a spec names them in secretEnv. */
  secrets?: Record<string, string>;
  /** Called with the pid right after the spawn (the resource sampler starts here). */
  onStart?: (pid: number) => void;
}

/**
 * Writes <outDir>/k6-config.json (non-secret only), runs one k6 process and returns its result. Only the secretEnv names are
 * forwarded from the runner's environment, on the child's environment, never on argv and never into a file.
 */
export async function runK6(input: RunK6Input): Promise<K6RunResult> {
  const { spec, outDir } = input;
  mkdirSync(outDir, { recursive: true });
  const configPath = path.join(outDir, "k6-config.json");
  // the full config (with the publishable key the case needs) lives outside the results; only its redacted copy is kept
  // A knee run's plan goes to the script as its `knee` block (plan task 1 §6.3), a spike run's as `spike` (Task 6); the others carry neither.
  const full = {
    ...input.config,
    ...(spec.knee ? { knee: spec.knee } : {}),
    ...(spec.spike ? { spike: spec.spike } : {}),
    label: spec.label,
    env: spec.env,
  };
  writeFileSync(configPath, `${JSON.stringify(redactForArtifact(full), null, 2)}\n`);
  const runDir = mkdtempSync(path.join(os.tmpdir(), "p6-k6-config-"));
  const childConfigPath = path.join(runDir, "k6-config.json");
  writeFileSync(childConfigPath, `${JSON.stringify(full, null, 2)}\n`);
  const summaryPath = path.join(outDir, `k6-${spec.label}-summary.json`);
  const pointsPath = path.join(outDir, `k6-${spec.label}.json.gz`);
  const stdoutPath = path.join(outDir, `k6-${spec.label}.log`);

  const childEnv: NodeJS.ProcessEnv = {
    PATH: input.env.PATH,
    HOME: input.env.HOME,
    ...spec.env,
    P6_LOAD_CONFIG: childConfigPath,
  };
  const source = { ...input.env, ...input.secrets };
  for (const name of spec.secretEnv ?? []) {
    const value = source[name];
    if (value !== undefined) childEnv[name] = value;
  }

  const out = openSync(stdoutPath, "w");
  const startedAtMs = Date.now();
  const child = spawn(
    input.binary ?? "k6",
    ["run", "--summary-export", summaryPath, "--out", `json=${pointsPath}`, spec.script],
    { env: childEnv, stdio: ["ignore", out, out] },
  );
  input.onStart?.(child.pid ?? 0);
  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? 1));
    });
    return {
      label: spec.label,
      exitCode,
      summaryPath,
      pointsPath,
      stdoutPath,
      startedAtMs,
      endedAtMs: Date.now(),
      pid: child.pid ?? 0,
    };
  } finally {
    closeSync(out);
    rmSync(runDir, { recursive: true, force: true });
  }
}
