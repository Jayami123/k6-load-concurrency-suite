import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { K6RunResult, K6RunSpec } from "./types.ts";

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
  // A knee run's plan goes to the script as its `knee` block (plan task 1 §6.3), a spike run's as `spike` (Task 6); the others carry neither.
  writeFileSync(
    configPath,
    `${JSON.stringify({ ...input.config, ...(spec.knee ? { knee: spec.knee } : {}), ...(spec.spike ? { spike: spec.spike } : {}), label: spec.label, env: spec.env }, null, 2)}\n`,
  );
  const summaryPath = path.join(outDir, `k6-${spec.label}-summary.json`);
  const pointsPath = path.join(outDir, `k6-${spec.label}.json.gz`);
  const stdoutPath = path.join(outDir, `k6-${spec.label}.log`);

  const childEnv: NodeJS.ProcessEnv = {
    PATH: input.env.PATH,
    HOME: input.env.HOME,
    ...spec.env,
    P6_LOAD_CONFIG: path.resolve(configPath),
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
  }
}
