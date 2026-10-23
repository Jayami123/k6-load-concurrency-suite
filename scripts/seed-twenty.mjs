// Seeds the Twenty stack through the harness adapter. Run after `npm run up:twenty`.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAdapter } from "qa-portfolio-harness";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(repoRoot, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);
// Same default as scripts/harness.mjs. Must be set before getAdapter(): the harness reads its config on the first call.
process.env.PRODUCTS_ROOT ||= path.resolve(repoRoot, "..", "products");

const seed = await getAdapter("twenty").seed();
console.log(`twenty seed: created=${seed.created} users=${seed.users.length}`);
