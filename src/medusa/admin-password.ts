// The local Medusa admin password (P6 load harness). It lives in an owner-only file outside the repo, so a reset of the
// database volume keeps the same admin login, and a rerun reuses it. Pure apart from the file itself; never logs the value.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** The file that keeps the local admin password: $HOME/.p6/medusa-admin, outside the repo. */
export function medusaAdminPasswordFile(home: string = os.homedir()): string {
  return path.join(home, ".p6", "medusa-admin");
}

/** A generated password: 32 url-safe characters plus upper, lower, digit and special, the admin's password rules. */
export function generateAdminPassword(): string {
  return `${randomBytes(24).toString("base64url")}Aa1!`;
}

export interface AdminPassword {
  password: string;
  /** True when this call wrote the file: the value is new, so an existing admin user does not have it. */
  created: boolean;
}

/**
 * The password for this run: the environment value when set (CI generates one per run), else the stored file, else a new one
 * written to the file (owner-only, exclusive create). The messages never contain the password.
 */
export function resolveAdminPassword(file: string, envValue: string | undefined): AdminPassword {
  if (envValue) return { password: envValue, created: false };
  if (existsSync(file)) {
    const mode = statSync(file).mode & 0o777;
    if ((mode & 0o077) !== 0)
      throw new Error(
        `TEST BUG: ${file} is readable by others (mode ${mode.toString(8)}); chmod 600 it, then rerun.`,
      );
    const password = readFileSync(file, "utf8").trim();
    if (password === "")
      throw new Error(`TEST BUG: ${file} is empty; delete it and reset the Medusa volume.`);
    return { password, created: false };
  }
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const password = generateAdminPassword();
  writeFileSync(file, `${password}\n`, { mode: 0o600, flag: "wx" });
  return { password, created: true };
}

/**
 * The message for a login the admin API refused with 401: the user exists with another password, so the stored file and the
 * database disagree. The fix is the volume reset; the file is kept and reused after it.
 */
export function adminLoginFailure(status: number, file: string, created: boolean): string {
  const why = created
    ? `${file} did not exist, so a new password was written there, but the admin user already exists with another one`
    : `the password in ${file} does not match the admin user`;
  return `TEST BUG: Medusa admin login answered HTTP ${status}: ${why}. Reset the Medusa volume (npm run down:medusa, remove only qa-harness-medusa_medusa_harness_pg, npm run up:medusa), keep ${file}, then rerun.`;
}
