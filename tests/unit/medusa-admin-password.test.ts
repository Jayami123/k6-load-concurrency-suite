import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  adminLoginFailure,
  medusaAdminPasswordFile,
  resolveAdminPassword,
} from "../../src/medusa/admin-password.ts";

function fileIn(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), "p6-admin-")), "medusa-admin");
}

describe("medusa admin password", () => {
  it("lives in an owner-only file under the home directory, outside the repo", () => {
    assert.equal(medusaAdminPasswordFile("/home/x"), path.join("/home/x", ".p6", "medusa-admin"));
  });

  it("uses the environment value when set and writes nothing", () => {
    const file = fileIn();
    const r = resolveAdminPassword(file, "env-value");
    assert.deepEqual(r, { password: "env-value", created: false, source: "env" });
    assert.equal(existsSync(file), false);
  });

  it("generates a password on first use, writes it owner-only, and reuses it on the next run", () => {
    const file = fileIn();
    const first = resolveAdminPassword(file, undefined);
    assert.equal(first.created, true);
    // Windows reports 0o666 for a writable file, so the mode is asserted on POSIX only.
    if (process.platform !== "win32")
      assert.equal((statSync(file).mode & 0o777).toString(8), "600");
    const second = resolveAdminPassword(file, undefined);
    assert.equal(second.created, false);
    assert.equal(second.password, first.password);
    assert.equal(readFileSync(file, "utf8").trim(), first.password);
  });

  it("refuses a file readable by others, without printing the password", () => {
    const file = fileIn();
    writeFileSync(file, "secret-value\n");
    chmodSync(file, 0o644);
    if (process.platform === "win32") return;
    assert.throws(
      () => resolveAdminPassword(file, undefined),
      (err: Error) => /chmod 600/.test(err.message) && !err.message.includes("secret-value"),
    );
  });

  it("refuses an empty file", () => {
    const file = fileIn();
    writeFileSync(file, "\n");
    chmodSync(file, 0o600);
    assert.throws(() => resolveAdminPassword(file, undefined), /is empty/);
  });

  it("a 401 with a missing file says to reset the volume, and never carries a password", () => {
    const msg = adminLoginFailure(401, "/h/.p6/medusa-admin", { created: true, source: "file" });
    assert.match(msg, /^TEST BUG: Medusa admin login answered HTTP 401/);
    assert.match(msg, /qa-harness-medusa_medusa_harness_pg/);
    assert.match(msg, /did not exist, so a new password/);
    const stale = adminLoginFailure(401, "/h/.p6/medusa-admin", { created: false, source: "file" });
    assert.match(stale, /does not match the admin user/);
    assert.match(stale, /Reset the Medusa volume/);
  });

  it("a 401 with the environment password names the variable and does not send the operator to the file", () => {
    const msg = adminLoginFailure(401, "/h/.p6/medusa-admin", { created: false, source: "env" });
    assert.match(msg, /from MEDUSA_ADMIN_PASSWORD/);
    assert.match(msg, /file is not used in this run/);
    assert.doesNotMatch(msg, /Reset the Medusa volume/);
  });
});
