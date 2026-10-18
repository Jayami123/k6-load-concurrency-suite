// `k6 inspect` every k6 script. Skips with a notice when k6 is not installed.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const version = spawnSync("k6", ["version"], { encoding: "utf8" });
if (version.error || version.status !== 0) {
  console.log("k6 not found on PATH; skipping k6 inspect.");
  process.exit(0);
}
console.log(version.stdout.trim());

/** @param {string} dir @returns {string[]} */
function listScripts(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listScripts(full);
    return entry.name.endsWith(".js") ? [full] : [];
  });
}

const scripts = listScripts(path.join(repoRoot, "k6"));
let failed = 0;
for (const file of scripts) {
  const rel = path.relative(repoRoot, file);
  const result = spawnSync("k6", ["inspect", file], { encoding: "utf8" });
  if (result.status === 0) {
    console.log(`k6 inspect ok: ${rel}`);
  } else {
    failed += 1;
    console.error(`k6 inspect failed: ${rel}\n${result.stderr || result.stdout}`);
  }
}
if (failed > 0) process.exit(1);
console.log(`k6 inspect: ${scripts.length} script(s) ok.`);
