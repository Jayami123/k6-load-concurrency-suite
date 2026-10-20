// Runs qa-portfolio-harness up/down the way P1 CI does (node .../scripts/up.mjs <product>),
// after loading this repo's .env and filling the P6 defaults.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
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

// TEMPORARY BRIDGE: remove with the next qa-portfolio-harness release (up returns once Cal is
// healthy, down stops the web server). Probe 2026-10-20: Cal's up.mjs never returns and its down()
// leaves `next start` on :3000. P6 runs it in its own process group, waits for the ready line, and
// stops the group on down.
/** @type {Record<string, LongRunning>} */
const LONG_RUNNING = {
  // "already healthy/listening" is printed when Cal was already up; up.mjs then exits 0.
  cal: { ready: /Cal web is up at |Cal already (healthy|listening) at /, port: 3000 },
};
/** @typedef {{ ready: RegExp, port: number }} LongRunning */
const productName = String(product);
const stateDir = path.join(repoRoot, "results", "harness");
const pgidFile = path.join(stateDir, `${productName}.pgid`);
const logFile = path.join(stateDir, `${productName}-up.log`);

/** @param {number} port */
function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

/** @param {LongRunning} spec */
async function upLongRunning(spec) {
  mkdirSync(stateDir, { recursive: true });
  // A second up must not replace the pgid of the group that is still serving.
  if (existsSync(pgidFile) && (await portOpen(spec.port))) {
    console.log(`${product} already running (pgid ${readFileSync(pgidFile, "utf8").trim()})`);
    return 0;
  }
  const out = openSync(logFile, "w");
  const child = spawn(process.execPath, [script, productName], {
    cwd: repoRoot,
    detached: true,
    stdio: ["ignore", out, out],
  });
  writeFileSync(pgidFile, `${child.pid}\n`);
  let exited = null;
  child.on("exit", (code) => (exited = code ?? 1));
  child.unref();
  const timeoutMs = Number(process.env.HARNESS_UP_TIMEOUT_MS || 3_600_000);
  const deadline = Date.now() + timeoutMs;
  let printed = 0;
  for (;;) {
    const text = readFileSync(logFile, "utf8");
    process.stdout.write(text.slice(printed));
    printed = text.length;
    if (spec.ready.test(text)) return 0;
    if (exited !== null) {
      rmSync(pgidFile, { force: true });
      console.error(`ENV: harness up ${product} exited ${exited} before ready (log ${logFile})`);
      return 1;
    }
    if (Date.now() > deadline) {
      console.error(`ENV: harness up ${product} not ready after ${timeoutMs} ms; stopping it`);
      await stopGroup(spec);
      return 1;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/** @param {LongRunning} spec */
async function stopGroup(spec) {
  if (!existsSync(pgidFile)) return;
  const pgid = Number(readFileSync(pgidFile, "utf8").trim());
  /** @param {NodeJS.Signals} sig */
  const signal = (sig) => {
    try {
      process.kill(-pgid, sig);
    } catch (err) {
      if (/** @type {NodeJS.ErrnoException} */ (err).code !== "ESRCH") throw err;
    }
  };
  signal("SIGTERM");
  for (let i = 0; i < 30 && (await portOpen(spec.port)); i++) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (await portOpen(spec.port)) signal("SIGKILL");
  rmSync(pgidFile, { force: true });
}

console.log(`harness ${action} ${product} (PRODUCTS_ROOT=${process.env.PRODUCTS_ROOT})`);
const spec = LONG_RUNNING[productName];
if (spec && action === "up") {
  process.exit(await upLongRunning(spec));
}
const result = spawnSync(process.execPath, [script, product], { cwd: repoRoot, stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
}
if (spec && action === "down") {
  await stopGroup(spec);
}
process.exit(result.status ?? 1);
