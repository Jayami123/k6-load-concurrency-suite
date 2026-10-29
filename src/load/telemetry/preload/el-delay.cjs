// Event-loop delay preload: loaded with --require by the harness (HARNESS_EL_OUT set). Node built-ins only.
// One line per second: t (epoch ms), p50, p99, max (ms), pid and role (HARNESS_EL_ROLE). Numbers and the role only.
// An I/O error disables the timer after the first failure, so an unwritable directory never crashes the product.
const { monitorEventLoopDelay } = require("node:perf_hooks");
const fs = require("node:fs");
const path = require("node:path");
const out = process.env.HARNESS_EL_OUT;
if (out) {
  const h = monitorEventLoopDelay({ resolution: 10 });
  h.enable();
  const file = path.join(out, `el-${process.pid}.ndjson`);
  const role = process.env.HARNESS_EL_ROLE ?? "unknown";
  const tick = setInterval(() => {
    try {
      const line = {
        t: Date.now(),
        p50: h.percentile(50) / 1e6,
        p99: h.percentile(99) / 1e6,
        max: h.max / 1e6,
        pid: process.pid,
        role,
      };
      fs.appendFileSync(file, JSON.stringify(line) + "\n");
      h.reset();
    } catch {
      clearInterval(tick);
      h.disable();
    }
  }, 1000);
  tick.unref();
}
