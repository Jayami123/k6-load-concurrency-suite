// Runs qa-portfolio-harness up/down the way P1 CI does (node .../scripts/up.mjs <product>),
// after loading this repo's .env and filling the P6 defaults.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ACTIONS = ["up", "down"];
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [action, product] = process.argv.slice(2);

if (!action || !ACTIONS.includes(action) || !product) {
  console.error("Usage: node scripts/harness.mjs <up|down> <cal|documenso|medusa|twenty>");
  process.exit(1);
}

// Values already in the environment (CI job env, Cursor secrets) win over .env.
const envFile = path.join(repoRoot, ".env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}
if (!process.env.PRODUCTS_ROOT) {
  process.env.PRODUCTS_ROOT = path.resolve(repoRoot, "..", "products");
}
if (!process.env.MEDUSA_SKIP_STOREFRONT) {
  process.env.MEDUSA_SKIP_STOREFRONT = "1";
}

const script = path.join(
  repoRoot,
  "node_modules",
  "qa-portfolio-harness",
  "scripts",
  `${action}.mjs`,
);
if (!existsSync(script)) {
  console.error(`Harness script missing at ${script}. Run npm ci first.`);
  process.exit(1);
}

console.log(`harness ${action} ${product} (PRODUCTS_ROOT=${process.env.PRODUCTS_ROOT})`);
const result = spawnSync(process.execPath, [script, product], { cwd: repoRoot, stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
}
process.exit(result.status ?? 1);
