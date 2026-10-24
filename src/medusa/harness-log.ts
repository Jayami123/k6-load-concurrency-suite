import { readFileSync } from "node:fs";
import path from "node:path";

// ANSI colour codes are stripped before any line is matched: the harness colours the "info:" prefix.
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

export type LockProvider = "redis" | "memory" | "unknown";

export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

/** Text after the last `--- spawn` line. The logs are append-only across `up` runs. */
export function lastSpawnSection(text: string): string {
  const clean = stripAnsi(text);
  const parts = clean.split(/^--- spawn .*$/m);
  return parts.length > 1 ? (parts[parts.length - 1] ?? "") : clean;
}

/** `locking-redis` provider line => redis; `Using "in-memory" as default` => memory; neither => unknown. */
export function lockProviderFromLog(text: string): LockProvider {
  const section = lastSpawnSection(text);
  if (/Connection to Redis in "locking-redis" provider established/.test(section)) return "redis";
  if (/Locking module: Using "in-memory" as default\./.test(section)) return "memory";
  return "unknown";
}

const COMPLETE_LINE = /"method":"POST","path":"\/store\/carts\/cart_[A-Za-z0-9]+\/complete"/g;

/** Cart completions this backend logged since its last start. */
export function countCompleteRequests(text: string): number {
  return (lastSpawnSection(text).match(COMPLETE_LINE) ?? []).length;
}

/** Harness state directory: `<repo>/node_modules/qa-portfolio-harness/.harness` unless P6_MEDUSA_LOG_DIR is set. */
export function harnessLogDir(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  const override = env.P6_MEDUSA_LOG_DIR?.trim();
  return override ? override : path.join(cwd, "node_modules", "qa-portfolio-harness", ".harness");
}

export function readBackendLog(index: 0 | 1, dir = harnessLogDir()): string {
  return readFileSync(
    path.join(dir, index === 0 ? "medusa-backend.log" : "medusa-backend-2.log"),
    "utf8",
  );
}
