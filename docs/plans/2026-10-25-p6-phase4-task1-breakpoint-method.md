# P6 Phase 4 Task 1: breakpoint method and knee report (`P6-X-LOAD-021`, proves `P6-RULE-006`) (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Structure follows
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md). Scope source: roadmap
[2026-10-22-p6-phase4-roadmap.md](2026-10-22-p6-phase4-roadmap.md) "Task 1", D2 (stop rule), D3, D11, D13. Rules:
[docs/agent-rules.md](../agent-rules.md).

**Paths.** Every path is a path on `main` (`origin/main` at `2db9726` or later). The Phase 3 stack is merged: Task 10 is PR #62
(`63c4d87`), the product LOAD telemetry and the median tooling are PR #64 (`0b07594`), the smoke baseline is PR #65 (`6e307cf`). This task reads
`k6/thresholds/smoke-p95.json` only through an injected number, so the self-test uses a constant; the product knee plans (Tasks 2 to 4) read it through
`parseSmokeBaseline` and `smokeP95For` of `src/load/smoke-baseline.ts` (on main, PR #65, `6e307cf`).

## 1. Header

- **Task.** Phase 4 Task 1. Case: `P6-X-LOAD-021` (the self-test of the method and the report format, run on the stub). It proves rule `P6-RULE-006`; the rule id is the proof's name, the case id is a `P6-X-LOAD-nnn` id like every other self-test case (Q5, §13).
- **Plan branch.** `plan/2026-10-25-p6-phase4a-plans` (no PR, never deleted).
- **Build branch (pattern).** `feat/<build date>-p6-breakpoint-method`.
- **Base.** `origin/main` after PRE-1 (the `P6-MED-LOAD-006` storm fix; `docs/plans/2026-10-25-p6-phase4-pre1-med-load-006-storm-fix.md`); PRE-2 is independent of this task (it only touches `cal-smoke`). `2db9726` today.
- **Harness pin.** Unchanged (`v0.2.15`). **Environment change.** None. The cgroup question of §3.8 is a finding, not a change.
- **Unit tests.** B1 = the count on `main` when the build starts, measured at build time (**865** at `2db9726` today: Node 24, `node --test tests/unit/*.test.ts`, 178 suites, all pass;
  PRE-1 and PRE-2 add their own deltas first). This plan adds **+68** (§12); expected B1 + 68.
- **Stop for owner review.** Yes (rule 10): a new CI job in `perf.yml`; the label type and `K6RunSpec` get additive fields. No harness
  pin and no shared runner change.

## 2. What it proves

A capacity statement is a measured **range** with its stop rule, run ids and environment, never one "maximum RPS". The method: held
`ramping-arrival-rate` steps; a step stops the run when the non-conflict error rate exceeds 1 % or the step's http p95 reaches 10×
the journey-smoke p95 (D2); the report says "between step s and s+1", names the first saturated resource by a rule written down and
unit-tested, and is INVALID when the generator, not the product, was the limit. Self-test: a CPU-bound stub with a known limit; the
method must report the range that contains it, and must refuse to call a knee when the generator is the limit or no step trips.

- **Finance and healthcare.** The form an audited sizing statement takes for a payment switch or a hospital scheduling system: "the
  service degraded between 140 and 220 requests per second, p95 rule, CPU of the application process first, run ids and environment
  attached".

## 3. Live probe evidence

Probe date 2026-10-25 (UTC), cloud VM (Node v22.23.3, 4 vCPU, 16 GB), k6 2.3.0, harness v0.2.15. Everything here ran against
throwaway stubs in the scratchpad (no product); the stubs are described so a builder can rebuild them. **VM timings prove a step
works; no number below is a target or a published value.**

### 3.1 How the stop rule is evaluated per held step (roadmap probe item 1)

Three mechanisms were considered and the first two were run.

| Option                                                                                                                                           | Probed        | Result                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. One k6 process, `ramping-arrival-rate`, each request tagged `step:<i>`, per-step submetric thresholds with `abortOnFail` and `delayAbortEval` | yes, k6 2.3.0 | works (below); k6 itself stops the run; summary export keeps every per-step statistic; runs standalone with `k6 run` (D6)                                                                                |
| B. The runner reads the k6 JSON output while it runs and stops k6                                                                                | no (argued)   | needs a streaming parser in the runner during the run, and the points file is large (§3.5); more moving parts                                                                                            |
| C. One k6 process per step                                                                                                                       | no (argued)   | each journey uses `exec.scenario.iterationInTest` as its slot or email index (Cal `cal-book.js`, Medusa `med-checkout.js`), which restarts at 0 in every process, so it needs an offset in every journey |

**Decision: A, with a second, authoritative evaluation after the run** (the runner recomputes the rule from the summary export and
reports it; k6's abort is the mechanism, the report is the record; if they disagree the run is a TEST BUG).

Scratch scripts (kept in the scratchpad, not in the repo; the skeleton of the production script is §6.3):

```text
stub:   node <scratch>/cap-stub.mjs 18091 8 25      8 slots x 25 ms -> capacity 320 req/s (queues beyond that)
script: ramping-arrival-rate, stages = [ramp 2 s to R_i, hold 10 s at R_i] for R = 100,150,200,...; each iteration:
        t = Date.now() - exec.scenario.startTime; step = floor(t / slot); exec.vu.tags.step = inHold ? step : "ramp"
        thresholds: "http_req_duration{step:i}" : [{ threshold: "p(95)<300", abortOnFail: true, delayAbortEval: "4s" }]
                    "p6_nonconflict_error{step:i}" : [{ threshold: "rate<0.01", abortOnFail: true, delayAbortEval: "4s" }]
                    "p6_step_started{step:i}" : []       (empty: only to put the submetric in the summary)
$ k6 run --summary-export s3.json knee2.js ; echo exit=$?
time="…" level=error msg="thresholds on metrics 'http_req_duration{step:5}' were crossed; at least one has abortOnFail enabled, stopping test prematurely"
exit=99      (run stopped 56 s into a planned 100 s)
step 0 800 started  p95 26.7 ms        step 3 2000 p95 26.3        step 5 (350/s) started 1351 of 2800, p95 390.3 ms  thresholds {"p(95)<300": true}
step 1 1200          26.5               step 4 2400 p95 26.2        steps 6..9 never started (0)
dropped_iterations 36 ; vus_max 119 of 400
```

So the rule fires in the step whose rate is above the limit (350 > 320) and not before (300 is clean); k6 exits **99** (thresholds
crossed); the abort comes about 6 s into the step (the 4 s `delayAbortEval` plus the 2 s threshold tick). Facts the design rests on:

- **Per-step statistics come from the summary export, not the points file.** `metrics["http_req_duration{step:5}"]` has `p(95)`,
  `p(99)`, `med`, `max`, `avg` and `thresholds: {"p(95)<300": true}`; a Rate has `passes`, `fails`, `value` (**`passes` counts the
  true values**: for an error Rate, `passes` is the error count); a Counter has `count`.
- **A submetric exists in the summary only if some threshold names it.** An empty list works: `thresholds["p6_step_started{step:i}"] = []`
  put `{ count: 300 }` for step 0 in the summary (probed, `steps=4 hold=6`: counts 300, 600, 900, 1200 = rate x hold exactly, exit 0).
- **No trip means exit 0** (all steps ran) and the later steps have counts; **a trip means exit 99**; an error-rate trip is the same:
  with the stub answering 500 to everything, `p6_nonconflict_error{step:0}` read `passes 198, value 1`, thresholds `{"rate<0.01": true}`, exit 99.
- **The operators must match D2.** "error rate > 1 %" crosses on `rate <= 0.01` failing, so the threshold is `rate<=0.01`, not `rate<0.01`
  (equal to 1 % is not a stop). "p95 >= 10x" crosses on `p(95)<X` failing at exactly X, so `p(95)<X` is right (equal trips).
- **The custom `step` tag survives the repo's `SYSTEM_TAGS`** (`standardOptions` removes `url`): probed with `SYSTEM_TAGS` imported from
  `k6/lib/pure/options.js`; the `{step:i}` submetrics were still in the summary.
- **Setup time equals the scenario start.** `setup()` writing `Date.now()` to a Gauge and an iteration writing `exec.scenario.startTime`
  gave the same millisecond (difference 0 on the VM). So `p6_knee_t0_ms` from `setup()` is the origin that maps telemetry samples
  to steps.

### 3.2 The stub stall that the method must find (roadmap probe item 3)

A busy-wait stub is deterministic: it does not depend on how fast the machine is, because it spins on the wall clock.

```text
burn stub: node <scratch>/burn-stub.mjs 18091 5     each request spins 5 ms of wall time on the one Node thread -> about 200 req/s
plan: start 60, step 80, hold 10 s, ramp 2 s, 5 steps (60, 140, 220, 300, 380); smoke p95 6 ms -> stop at 60 ms
exit=99
step 0  60/s  started 600   p95 6.1 ms   no trip      CPU of the stub process (one /proc sample per second): 0.35 cores
step 1 140/s  started 1400  p95 5.7 ms   no trip      CPU 0.78 cores
step 2 220/s  started  430  p95 338.9 ms TRIP         CPU 1.01 to 1.06 cores (saturated)
```

The known limit (200/s) lies in `[140, 220)`; the method must report exactly that step range, and the first saturated resource is
the application process CPU (0.78 below 0.9, 1.0 at the stop step). With a 3 ms spin the same shape appeared at 300/350, but 300/s was
90 % of the limit and a noisy runner could trip there, so the self-test plan avoids a clean step above 70 % of the limit.

Two more stub runs fix the INVALID side (a stub with 25 ms latency and unlimited slots, `cap-stub.mjs 18091 1000 25`):

```text
undersized (maxVUs 2, plan 100,250,400):   exit 0   started 666 of 1000 (step 0), 712, 722   dropped_iterations 6191   vus_max 2
norule     (VUs sized,  plan 100,250,400):  exit 0   started 1000, 2500, 3999 of 4000        dropped 0, p95 26.6 / 26.4 / 26.2 ms
```

`undersized` is what a generator bottleneck looks like in a knee run (steps start far fewer iterations than planned although no step
trips); `norule` is a plan that ends before the stop rule (no knee).

### 3.3 Who is the bottleneck when `dropped_iterations` appears (roadmap risk "generator vs product")

The current validity judge (`src/load/validity.ts`) makes any dropped iteration or a peak of VUs equal to `maxVUs` an INVALID run.
In a knee run the product's own slowdown at the stop step also drops iterations (the burn stub dropped 56 in its stop step, 36 for
the slot stub; `vus_max` stayed far below `maxVUs`). So a knee run cannot use the run-wide counter. The probe shows the clean signal is
the **per-step started count against the plan**: `started(step) / (rate x holdSec)` was 1.000, 1.000 on the clean steps of the burn
stub and 0.67 on a generator-starved step. The rule (unit-tested, §6.5): a **clean** step (before the stop step) that starts fewer iterations than planned minus an allowance of `max(2, floor(3 % of planned))` makes the run INVALID (`dropped_iterations`; a bare 3 % would make 14 of 15 planned iterations a false INVALID at Medusa's 0.5 per second, §3.9); the stop step is not judged (it saturated, which is the
result); the code `vu_exhausted` is not used in knee mode (VU exhaustion shows as dropped iterations in a clean step); `k6_cpu`,
`runner_cpu`, `runner_memory`, `telemetry_gap`, `clock_skew` apply to the whole run as today. A new code `no_knee` marks a plan that
ended without a trip.

### 3.4 What the points file costs (roadmap risk "large output")

`--out json` for the 14,216-request probe run: **1.9 MB gzipped, 47.8 MB uncompressed, 213,714 lines** (15 lines and 3.4 KB per
request, 136 bytes gzipped per request). `readPointsGz` (`src/load/chart/k6-points.ts`) does `gunzipSync(...).toString("utf8")`; Node's
string limit is `buffer.constants.MAX_STRING_LENGTH` = 536,870,888 characters on this VM, so the synchronous reader fails above about
**160,000 requests per run**. A product knee of 20 minutes at a few hundred requests per second is 100,000 to 600,000 requests, and
would make 14 to 80 MB of gzip. Therefore knee mode needs a **streaming** reader (§6.6), and keeps the points file only when it is at
most 25 MB (the Actions artefact only; `.json.gz` is outside the release allowlist that PR #63 (`5db87d7`) shipped, `.github/workflows/evidence-release.yml` line 140, so points never reach the release).

### 3.5 The "non-conflict error" definition per product (roadmap probe item 2)

From the Phase 1 and 2 README contracts (`README.md` "Known product bugs", the race sections), `k6/lib/retry.js` (`classifyAttempt`,
`CAL_REDACTED`) and `k6/lib/pure/refusal.js` (`classifyRefusal`):

| Product   | Conflict (counted separately, never an error)                                                                                                                                           | Error (counts toward the 1 % rule)                                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cal       | 409 (`no_available_users_found_error`); 400 whose message is the redacted `An error occurred while querying the database.` (`P6-OBS-CAL-001`, `-003`)                                   | every 5xx, status 0 (timeout, reset), every other 4xx                                                                                                |
| Medusa    | 400 `not_allowed` with an inventory message ("Not enough stock" / insufficient inventory: `classifyRefusal` = `clean`)                                                                  | every 5xx, status 0, every other 4xx (a ghost `Updating Status from …` 400 is the F-M2 ghost order, an error here: stock must not run out in a knee) |
| Documenso | none. **Correction to the roadmap:** `ALREADY_SIGNED` is a **200** by design (README, `P6-DOC-RACE-002`: "a duplicate is 200 by design, not a 4xx"), so it never reaches the classifier | every 5xx, status 0, every 4xx (a 429 from the limiter is an error unless the case runs the D12 profile)                                             |

The journeys of a knee give each iteration its own slot, stock unit or document, so conflicts should be zero; the classifier keeps a
stock-out or a slot collision from being read as saturation if one happens, and the run reports the conflict count next to the error
count.

### 3.6 The "first saturated resource" rule (roadmap probe item 4)

Inputs available outside the application today (`src/load/telemetry/sampler.ts`, one sample per second; probed live on Cal for Phase 3
Task 11's plan: five sources present): `proc` (`cpuTicks`, `rssMb`, `fds`, `members` of the application process group), `db` (`active`,
`idleInTx`, `waiting` = active with a non-client wait event, `total`, `waitingLocks`, `commits`, `rollbacks`, `deadlocks`), `container`
(database cpu and memory from its cgroup), `log` (`errorLines`, `http5xx`, `jobFailures`), `probe` (timed health URL). The application
pool is **not** observable from outside (only its effect on `db.total` and `db.active`). The rule (§6.4, pure and unit-tested):

1. For every step, take the samples whose time lies in the step's hold window minus 2 s at each edge (the window comes from
   `p6_knee_t0_ms` and the plan).
2. A resource is **over its level** in a sample when: `app_cpu` is judged per **step**, not per sample (below); `runner_cpu` the host CPU busy fraction of the sample is at least 0.85 (the validity limit `runnerBusyPctMax`; needs the `host` source, §3.9); `db_wait` `db.waiting >= 1` or `db.waitingLocks >= 1`;
   `db_conn` `db.total >= 0.8 x max_connections` (needs the setting, §3.8); `db_cpu` database container CPU >= 0.9 cores (only when the
   container source read without errors); `app_fds` fds >= 0.8 x the process soft limit (`/proc/<pid>/limits`, read once); `probe_slow`
   `probe.ms >= 10 x` its median in step 0.
3. A resource is **saturated in a step** when it is over its level in at least half of that step's samples (`SATURATED_FRACTION =
0.5`), and it must also be saturated in every later observed step (a blip does not count).
4. The **first saturated resource** is the one whose first saturated step is the smallest; a tie is broken by the fixed priority
   `app_cpu, runner_cpu, db_wait, db_conn, db_cpu, app_fds, probe_slow`. `app_cpu` is saturated in a step when the mean cores of the step are at least 0.85 times the peak step mean over the run **and** at least 0.9 cores (§3.9 R2). If none is saturated at the stop step the report says
   `none_observed` ("a limit inside the application, such as the event loop or a pool, that outside telemetry cannot see; harness
   H2 is Phase 5"), never a guess.
5. RSS is reported as a context series, not as a resource: nothing outside the process can say what its memory ceiling is. (Open
   decision Q4.)

### 3.7 Contradictions found in the code and the roadmap (facts the plan changes)

- `assertCorrectnessThresholds` (`k6/lib/pure/options.js`) throws on `http_req_duration…` thresholds (P6-RULE-001, D9). The stop rule
  needs exactly those on the per-step submetrics. The plan adds a separate, deliberately named `stopRuleThresholds` that is the only
  builder allowed to create them, and a unit test that `standardOptions` still throws on a latency threshold. The stop rule ends a
  measurement; it is not a pass/fail gate on a run (the verdict never fails because p95 was high).
- `LoadCase.label` and `RunMeta.label` are the literal `"functional load, not capacity"`, and `tests/unit/readme-rules.test.ts` forbids
  the bare word "capacity". The knee label is a second literal, `"knee range, environment-bound"`; README text for knees must say "knee
  range" (the test stays as is).
- `K6RunSpec.expectExit` is one number. A knee run ends with 99 (rule fired) or 0 (plan ended). The spec gets `allowExits?: number[]`.
- `RunMeta` has `rate`, `durationSec`, `plannedIterations`; for a knee they are start rate, the total planned seconds and the sum of
  `rate x hold`, and a new optional `knee` block records the plan.
- `src/load/chart/k6-points.ts` loads the whole file as a string (§3.4).

### 3.8 What the probe could not confirm ("confirm at build time" or in the first CI dispatch)

1. **`max_connections` of the product databases** (for `db_conn`): needs one read-only `SELECT current_setting('max_connections')::int`
   in the sampler at start. UNPROBED: product stacks are probed in Tasks 2 to 4; the select goes through `assertSelectOnly`.
2. **The database container source: a VM-only failure, the runner reads it.** On the Claude Code cloud VM `stat -f -c %T /sys/fs/cgroup` is `tmpfs`, `detectCgroup`
   treats that as cgroup v1 and the v1 paths do not exist, so the source errored on 31 of 31 samples (probed with a Cal stack on the VM, 2026-10-25). On the GitHub
   runner it works: in the three zips of release `p6-phase3` (`p6-40177412186-evidence.zip`, `p6-40178773022-evidence.zip`, `p6-40180625279-evidence.zip`, release target
   `7301cf1`, PR #67) all **30 of 30** `load-*/P6-*/*/telemetry-main.json` files report `sources.container` `present: true, errors: 0`, and the same holds for `proc`, `db`, `log`
   and `probe` (counted on 2026-10-25 from the public assets). So the 31-of-31 failure is a VM effect, not a runner effect. A VM with a `tmpfs` cgroup file system still lists the
   source as absent (§6.4 handles a missing source). The proposed extra `P6-X-LOAD-013` of the Phase 3 Task 11 plan (a `docker-stats` fallback) serves local VMs only and is
   **not** a prerequisite of this task.
3. **Stub self-test timing on the runner**: the job estimate of §9 is from the VM.
4. **`delayAbortEval` against short holds**: probed at hold 8 to 10 s with 4 s; the product plans set hold and delay from their own rate
   (a step needs at least 100 samples before its p95 is read; Task 2 to 4 plans size it).

### 3.9 Refinements found by the product probes of Tasks 2 to 6 (same session, 2026-10-25)

The Cal, Medusa and Documenso ramps, steady runs and spikes (the plans of Tasks 2 to 6) showed four things that belong here, because every later task builds on them.
Each has its evidence in the plan named.

- **R1. Rates below one per second need a longer `timeUnit`.** k6 rejects a fractional `target`, `startRate` or `rate` (`cannot unmarshal number 0.5 into … of type int64`;
  [Task 3 §3.1](2026-10-25-p6-phase4-task3-med-knee.md)). Medusa's steps are 0.5, 1.0, 1.5 per second. With `timeUnit: "10s"` and whole targets k6 started an iteration every 2.0 s
  at 0.5 per second (probed on `/health`). So the rates of a `KneePlanSpec` are iterations per second with a resolution of 0.1, and `buildKneePlan` makes every knee scenario
  `timeUnit: "10s"` with targets `round(rate x 10)`. Planned iterations per step stay `rate x holdSec` (15 at 0.5 per second for 30 s), which is why the dropped-iteration allowance
  of §3.3 has an absolute floor of 2.
- **R2. The application CPU level is relative to the run.** A fixed 0.9 cores would name `app_cpu` at Medusa's step 0 (0.82 to 0.92 cores, p95 394 ms) and every product's
  application group uses more than one core (Cal 0.43 / 0.75 / 0.97 / 1.08, Medusa 0.82 / 1.20 / 1.24, Documenso 0.89 / 1.37 / 1.61 / 1.69 cores per step; the Node main thread
  plus the Prisma engine or the in-process jobs). The rule of §3.6 point 4 (step mean at least 0.85 of the run's peak step mean, and at least 0.9 cores) names `app_cpu` at Cal step 2, Medusa
  step 1, Documenso step 2, the burn stub step 2: the step before or at the stop. The host CPU (`runner_cpu`, the 4-vCPU box shared by k6, the product and Postgres) needs a per-second
  source: `src/load/telemetry/host-stats.ts` reads `/proc/stat` deltas (`busyFraction`) and `MemAvailable`; the maximum seen in the probes was 46 to 69 % of the box, never the limit. The
  sampler also reads `SELECT current_setting('max_connections')::int` once at start (read-only, through `assertSelectOnly`) for `db_conn` (Medusa's is 100: 7 to 11 connections in use).
- **R3. Every audit reconciles per intent, not by count.** When k6 aborts, in-flight iterations lose their answer although the work is committed (Cal database 318 vs client 311 and
  334 vs 327: k6 336 started, 327 completed, 9 interrupted; Documenso 197 vs 192 completed with 27 to 36 unfinished documents; Medusa orders of interrupted checkouts read as `F-M2` ghost
  orders). A count slack (`0 <= database - client <= interrupted`) would let up to `interrupted` duplicate or ghost writes pass unseen, which is exactly the bug class this suite exists to
  find. So the reconcile is **per intent** (Jepsen-style indeterminate operations): every started iteration is an intent, the client logs one outcome line per finished iteration, and the
  audit compares rows to intents. Design in §6.8; this task owns it, Tasks 2 to 6 cite it. `interrupted = p6_step_started total - iterations` is still passed to the audit, but only as the
  upper bound of the number of indeterminate intents, never as slack for a difference.
- **R4. One parser for the dispatch inputs.** Tasks 2 to 4 take the plan from workflow inputs (`KNEE_START_RATE`, `KNEE_STEP_RATE`, `KNEE_HOLD_SEC`, `KNEE_RAMP_SEC`, `KNEE_MAX_STEPS`; empty
  string = default). `src/load/knee/plan-input.ts` (`kneePlanFromInputs(env, defaults)`) validates them once: rates 0.1 to 100 with one decimal, hold 10 to 120 s, ramp 0 to 10 s, steps 1 to 30,
  and a planned total of at most 5,000 iterations; otherwise `ENV: knee plan out of bounds` with the field named.

## 4. Depends on earlier plans

Phase 3 Task 3 (`k6/lib/pure/{options,sizing,prefix,config,journey}.js`, `k6/lib/{config,http,markers}.js`, `src/load/{stub-server,runner,
stages,k6-process,summary,types,cases}.ts`), Task 4 (`src/load/validity.ts`, `run-meta.ts`, `readiness.ts`), Task 5
(`src/load/telemetry/*`, `src/load/chart/*`), Task 6 (`src/load/reconcile/*`), Task 10 (on main, PR #62, `63c4d87`), the product LOAD telemetry hooks
(PR #64, `0b07594`: every product `LoadCase` has `telemetry: { product }`, the k6 cases export `const { setup, teardown } = clockHooks(__ENV.MARKER_URL)` from `k6/lib/markers.js`).
All present on `main`. The smoke reference (PR #65, `6e307cf`) is `k6/thresholds/smoke-p95.json` read through `parseSmokeBaseline` and `smokeP95For` (`src/load/smoke-baseline.ts`);
this task imports neither (the product knee plans will).

## 5. Build-time recheck

| #   | Check                       | Command                                                                                                                                                                                                                                               | Expected                                                                                                         |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Base                        | `git fetch origin main && git log -1 --format=%h origin/main`                                                                                                                                                                                         | `2db9726` or a descendant that contains PRE-1 (`git log --oneline origin/main \| grep -c "P6-MED-LOAD-006"` ≥ 1) |
| 2   | Baseline                    | `export PATH="/usr/local/bin:$PATH"; npm run check`                                                                                                                                                                                                   | exit 0; `# tests` = B1 (865 at `2db9726`; measure again, PRE-1 and PRE-2 move it); write B1 into the PR          |
| 3   | Names                       | `grep -n "export function rampingOpenScenario\|export function assertCorrectnessThresholds" k6/lib/pure/options.js; grep -n "export function judgeValidity" src/load/validity.ts; grep -n "export function readPointsGz" src/load/chart/k6-points.ts` | four hits; otherwise stop                                                                                        |
| 4   | Pinned k6                   | `k6 version`                                                                                                                                                                                                                                          | `k6 v2.3.0`                                                                                                      |
| 5   | The mechanism still works   | the scratch script of §3.1 against the slot stub                                                                                                                                                                                                      | exit 99, trip in the step above the stub limit, `{step:i}` submetrics in the summary                             |
| 6   | Burn stub deterministic     | `node src/load/stub-server.ts 0 0 0 1 5` (after step 5), then `curl` 20 times and time it                                                                                                                                                             | each answer takes ≥ 5 ms                                                                                         |
| 7   | Telemetry on the stub group | after step 7: `npm run load:knee-selftest -- --profile pr` and read `telemetry-knee.json`                                                                                                                                                             | `sources.proc.present` true, `samples[*].proc.cpuTicks` rising                                                   |

## 6. Design

### 6.1 File tree

```text
k6/lib/pure/knee.js                         NEW      buildKneePlan, stepAt, kneeVus, stopRuleThresholds, classifyResponse, intentLine (pure, no k6 import)
k6/lib/knee.js                              NEW      k6-facing: kneeOptions, beginKneeIteration, endKneeIteration (intent line), observeKneeResponses, kneeHooks (wraps clockHooks)
k6/lib/http.js                              CHANGED  + observeResponses(fn): every request() passes its response to the observer
k6/selftest/breakpoint-stub.js              NEW      the self-test script (standalone with k6 run)
k6/selftest/breakpoint-stub.example.json    NEW      its example config
src/load/knee/step-stats.ts                 NEW      KneePlanSpec, StepStat, stepStatsFromSummary
src/load/knee/stop-rule.ts                  NEW      StopRule, evaluateStopRule
src/load/knee/first-saturated.ts            NEW      SATURATION, firstSaturated
src/load/knee/knee-report.ts                NEW      KneeReport, buildKneeReport, formatKneeTable, kneeValidity
src/load/knee/stage.ts                      NEW      kneeStage (reconcile slot), expected-range check for the self-test
src/load/knee/plan-input.ts                 NEW      kneePlanFromInputs (workflow inputs → KneePlanSpec, validated)
src/load/telemetry/host-stats.ts            NEW      readHostSample (/proc/stat busy fraction, MemAvailable)
src/load/telemetry/sampler.ts               CHANGED  + host source; max_connections read once
src/load/knee/intents.ts                    NEW      parseIntentLog, classifyIntents, auditByIntent (pure, §6.8)
src/load/reconcile/{index,cal,medusa,types}.ts   CHANGED  counters { clientCount, intents? }; with intents the audits reconcile per intent instead of by count
k6/journeys/{cal-book,med-checkout,doc-sign}.js  CHANGED  opts.onCommit?.() at the lines that add to the commit counter (absent in every Phase 3 case)
src/load/chart/k6-points.ts                 CHANGED  + readPointsGzStream (streaming); readPointsGz stays for small runs
src/load/chart/render-chart.ts              CHANGED  + optional step bands
src/load/published.ts                       CHANGED  + formatPublishedKnee
src/load/stub-server.ts                     CHANGED  + burnMs option and fifth CLI argument
src/load/types.ts                           CHANGED  LoadLabel union; K6RunSpec.allowExits, K6RunSpec.knee; RunMeta.knee; InvalidCode + no_knee
src/load/runner.ts                          CHANGED  evaluateVerdict accepts allowExits
src/load/run-meta.ts                        CHANGED  knee block
src/load/telemetry/stages.ts                CHANGED  samplerStart takes ctx.handles.appProcess for the stub
src/load/cases.ts                           CHANGED  + KNEE_RULE_006 and the registry entry
scripts/write-ci-job-summary.ts             CHANGED  prints knee-report.md blocks
package.json                                CHANGED  + load:knee-selftest
.github/workflows/perf.yml                  CHANGED  + job load-knee-selftest
README.md                                   CHANGED  + "How to read a knee"
tests/unit/{k6-lib-knee,knee-step-stats,knee-stop-rule,knee-first-saturated,knee-report,knee-validity,knee-stage,load-cases-knee,k6-points-stream,stub-server-burn}.test.ts   NEW
tests/unit/{knee-plan-input,knee-intents,reconcile-intents,knee-journey-hooks,telemetry-host}.test.ts   NEW
tests/unit/{render-chart,load-table,load-published}.test.ts   CHANGED (+1, +1, +2 counted in §12)
```

### 6.2 Types (`src/load/types.ts`, additive)

```ts
export type LoadLabel = "functional load, not capacity" | "knee range, environment-bound";
// LoadCase.label and RunMeta.label: LoadLabel (was the first literal)

export interface KneePlanSpec {
  startRate: number; // iterations per second of step 0, one decimal (0.1 to 100); the scenario uses timeUnit "10s" (R1)
  stepRate: number; // added per step, one decimal
  holdSec: number; // the measured window of a step
  rampSec: number; // linear change between holds
  maxSteps: number;
}
// K6RunSpec additions
//   allowExits?: number[];   // default [expectExit ?? 0]; a knee run allows [0, 99]
//   knee?: KneePlanSpec & { smokeP95Ms: number; maxVUs: number; expect?: { lowerRate: number; upperRate: number; firstSaturated?: string } };
// RunMeta addition:  knee?: KneePlanSpec;
// InvalidCode addition:  | "no_knee"
```

`evaluateVerdict` in `src/load/runner.ts` changes one line: `const allowed = spec.allowExits ?? [spec.expectExit ?? 0]`, and a run's exit code fails only when it is not in `allowed`.

### 6.3 The k6 side

`k6/lib/pure/knee.js` (NEW; skeleton, all pure):

```js
/** @typedef {{ startRate: number, stepRate: number, holdSec: number, rampSec: number, maxSteps: number }} KneePlan */

/**
 * Held steps: for step i the rate is startRate + i*stepRate; the stages are [ramp to rate_i over rampSec, hold rate_i for holdSec].
 * @param {KneePlan} p
 * @returns {{ steps: Array<{ index: number, rate: number, holdFromSec: number, holdToSec: number }>, stages: Array<{ target: number, duration: string }>, totalSec: number }}
 */
export function buildKneePlan(p) {
  /* throws on rate/step/hold <= 0, ramp < 0, maxSteps < 1; i-th hold starts at i*(ramp+hold)+ramp */
}

/**
 * @param {ReturnType<typeof buildKneePlan>} plan
 * @param {number} elapsedMs since the scenario start
 * @returns {number | null} the step index while inside a hold window, null during a ramp or after the plan
 */
export function stepAt(plan, elapsedMs) {
  /* hold window is [holdFromSec, holdToSec) */
}

/** VUs to pre-allocate: ceil(peakRate x iterationMs/1000 x factor), at least min, at most maxCap (a knee never needs more than the cap; the product plan sets it from the probe). */
export function kneeVus({ peakRate, iterationMs, factor, min, maxCap }) {
  /* … */
}

/**
 * The only builder of latency thresholds (see §3.7). For each step i:
 *   http_req_duration{step:i}   [{ threshold: `p(95)<${stopP95Ms}`, abortOnFail: true, delayAbortEval: `${delayAbortEvalSec}s` }]
 *   p6_nonconflict_error{step:i}[{ threshold: `rate<=${errorRate}`, abortOnFail: true, delayAbortEval: … }]
 *   p6_step_started{step:i}, http_reqs{step:i}, checks{step:i}   []   (empty lists: they only put the submetrics in the summary)
 */
export function stopRuleThresholds(plan, { stopP95Ms, errorRate, delayAbortEvalSec }) {
  /* … */
}

/**
 * @param {"cal" | "medusa" | "documenso"} product
 * @param {number} status
 * @param {unknown} message the reply's message when the body is JSON
 * @returns {"ok" | "conflict" | "error"}
 */
export function classifyResponse(product, status, message) {
  /* table of §3.5; reuses CAL_REDACTED and classifyRefusal */
}

/**
 * The outcome line of §6.8: `{"intent":n,"outcome":"ok"|"fail"}`, plus `"net":true` on a fail whose iteration saw a response with status 0.
 * @param {number} intent exec.scenario.iterationInTest
 * @param {boolean} committed the journey's commit counter was added to (opts.onCommit ran)
 * @param {boolean} sawNetworkError
 * @returns {string}
 */
export function intentLine(intent, committed, sawNetworkError) {
  /* JSON.stringify of the object; `net` only when !committed && sawNetworkError */
}
```

`k6/lib/knee.js` (NEW, k6-facing):

```js
import exec from "k6/execution";
import { Counter, Gauge, Rate } from "k6/metrics";
import { observeResponses } from "./http.js";
import { clockHooks } from "./markers.js";
import {
  buildKneePlan,
  classifyResponse,
  intentLine,
  kneeVus,
  stepAt,
  stopRuleThresholds,
} from "./pure/knee.js";
import { rampingOpenScenario, standardOptions } from "./pure/options.js";

const started = new Counter("p6_step_started");
const t0 = new Gauge("p6_knee_t0_ms");
const nonconflict = new Rate("p6_nonconflict_error");
const conflicts = new Counter("p6_conflict_responses");

/** options for a knee script: the held-step scenario, the stop-rule thresholds, the repo's tags and trend stats. */
export function kneeOptions(cfg) {
  /* scenario: executor ramping-arrival-rate, startRate, stages from buildKneePlan, preAllocatedVUs/maxVUs from cfg.pre/cfg.max */
}

/** call first in every iteration: tags the VU with the step ("ramp" outside a hold), counts the iteration start, returns the intent number. */
let sawNetworkError = false; // per VU: a response with status 0 (timeout, reset) during the current iteration
export function beginKneeIteration(plan) {
  const idx = stepAt(plan, Date.now() - exec.scenario.startTime);
  const tag = idx === null ? "ramp" : String(idx);
  exec.vu.tags.step = tag;
  started.add(1, { step: tag });
  sawNetworkError = false;
  return exec.scenario.iterationInTest;
}

/** call last in every iteration (§6.8): one outcome line per finished iteration. `committed` = the journey's own commit counter was added to. */
export function endKneeIteration(intent, committed) {
  console.log(intentLine(intent, committed, sawNetworkError));
}

/** once in the init context: every response made through request() is classified for this product. */
export function observeKneeResponses(product) {
  observeResponses((res) => {
    if (res.status === 0) sawNetworkError = true;
    const cls = classifyResponse(product, res.status, jsonMessage(res));
    nonconflict.add(cls === "error");
    if (cls === "conflict") conflicts.add(1);
  });
}

/** setup() and teardown(): the Phase 3 clock markers (clockHooks of k6/lib/markers.js, shipped in PR #64) plus the knee origin. */
export function kneeHooks(markerUrl) {
  const clock = clockHooks(markerUrl);
  return {
    setup() {
      clock.setup();
      t0.add(Date.now());
    },
    teardown: clock.teardown,
  };
}
```

`rampingOpenScenario` of `k6/lib/pure/options.js` (shipped in Phase 3 for Phase 4) already builds `ramping-arrival-rate` stages
from `{ target, durationSec }`; `kneeOptions` uses it (no new executor builder). `standardOptions` is called with empty
thresholds for the tags, trend stats and system tags, and `kneeOptions` then sets `thresholds` to `stopRuleThresholds(...)` (the only
place a latency threshold is allowed). `k6/lib/http.js` (CHANGED): add

```js
/** @type {((res: { status: number, json: (p?: string) => unknown }) => void) | undefined} */
let observer;
export function observeResponses(fn) {
  observer = fn;
}
// request(): after the call, `if (observer) observer(res);` and return res (also in the retried() send path, once per attempt)
```

The doc-sign journey's multipart `create` step calls `http.post` directly; it gets one line, `observe(r)`, exported from `http.js` as
`export function observe(res) { if (observer) observer(res); }`. No other journey change.

`k6/selftest/breakpoint-stub.js` (NEW) skeleton:

```js
// Breakpoint self-test (P6-X-LOAD-021, proves P6-RULE-006). Standalone, against a stub started by hand:
//   node src/load/stub-server.ts 18080 0 0 1 5          (a 5 ms CPU-burn stub, about 200 requests/s)
//   P6_LOAD_CONFIG=k6/selftest/breakpoint-stub.example.json k6 run k6/selftest/breakpoint-stub.js
import { check } from "k6";
import { loadLoadConfig } from "../lib/config.js";
import {
  kneeHooks,
  kneeOptions,
  beginKneeIteration,
  endKneeIteration,
  observeKneeResponses,
} from "../lib/knee.js";
import { request } from "../lib/http.js";
import { buildKneePlan } from "../lib/pure/knee.js";

const cfg = {
  port: 18080,
  startRate: 60,
  stepRate: 80,
  holdSec: 10,
  rampSec: 2,
  maxSteps: 5,
  smokeP95Ms: 6,
  pre: 40,
  max: 80,
  delayAbortEvalSec: 4,
  ...loadLoadConfig([]),
};
const plan = buildKneePlan(cfg);
export const options = kneeOptions({ ...cfg, plan, tags: { case: "P6-X-LOAD-021" } });
export const { setup, teardown } = kneeHooks(__ENV.MARKER_URL);
observeKneeResponses("stub");
export default function () {
  const intent = beginKneeIteration(plan);
  const res = request("GET", `http://127.0.0.1:${cfg.port}/work`, "GET /work");
  check(res, { "status 200": (r) => r.status === 200 });
  endKneeIteration(intent, res.status === 200); // the stub has no database: "committed" = the answer was 200
}
```

(`observeKneeResponses("stub")` classifies by the generic rule: 2xx ok, every 4xx/5xx/0 error; the product-specific tables apply to the
three products only.)

### 6.4 The TypeScript side

`src/load/knee/step-stats.ts` (NEW):

```ts
export interface StepStat {
  index: number;
  rate: number;
  plannedIterations: number; // rate x holdSec
  startedIterations: number; // metrics["p6_step_started{step:i}"].count, 0 when absent
  requests: number; // http_reqs{step:i}.count
  p95Ms?: number; // undefined when the step has no requests
  errors: number; // p6_nonconflict_error{step:i}.passes
  errorRate: number; // errors / requests (0 when no requests)
  reached: boolean; // startedIterations > 0
}
/** Reads the per-step submetrics of a k6 summary export (§3.1). Pure; a missing metric is 0, never an invented number. */
export function stepStatsFromSummary(summary: unknown, spec: KneePlanSpec): StepStat[];
```

`src/load/knee/stop-rule.ts` (NEW):

```ts
export interface StopRule {
  smokeP95Ms: number;
  p95Factor: number; // 10 (D2)
  errorRate: number; // 0.01 (D2), a step stops when errorRate > this
  minRequests: number; // 20: a step with fewer requests cannot trip the rule
}
export const STOP_DEFAULTS = { p95Factor: 10, errorRate: 0.01, minRequests: 20 } as const;
export interface StopVerdict {
  stopStep: number | null;
  reasons: Array<"error_rate" | "p95">; // all that tripped at the stop step; D2 order puts error_rate first
  limitMs: number; // p95Factor x smokeP95Ms
}
/** First step (by index) that has >= minRequests and errorRate > rule.errorRate, or p95Ms >= p95Factor x smokeP95Ms. */
export function evaluateStopRule(stats: StepStat[], rule: StopRule): StopVerdict;
```

`src/load/knee/first-saturated.ts` (NEW): constants and signature of §3.6.

```ts
export const SATURATION = {
  appCores: 0.9, // floor; the level is also 0.85 x the run's peak step mean (R2)
  appPeakFraction: 0.85,
  hostBusy: 0.85,
  dbWaiting: 1,
  dbConnFraction: 0.8,
  dbCores: 0.9,
  fdsFraction: 0.8,
  probeFactor: 10,
} as const;
export const SATURATED_FRACTION = 0.5;
export const EDGE_TRIM_MS = 2000;
export type Resource =
  "app_cpu" | "runner_cpu" | "db_wait" | "db_conn" | "db_cpu" | "app_fds" | "probe_slow";
export const PRIORITY: Resource[] = [
  "app_cpu",
  "runner_cpu",
  "db_wait",
  "db_conn",
  "db_cpu",
  "app_fds",
  "probe_slow",
];
export interface Window {
  index: number;
  fromMs: number;
  toMs: number;
} // absolute epoch ms of a hold, from t0
export interface FirstSaturated {
  resource: Resource | "none_observed";
  step: number | null;
  perResource: Record<
    Resource,
    { observed: boolean; fractionByStep: number[]; firstSaturatedStep: number | null }
  >;
  absentSources: string[]; // sources the telemetry file marks present:false or with errors on every sample
}
export function firstSaturated(input: {
  samples: Array<Record<string, any>>; // telemetry-<label>.json "samples"
  windows: Window[];
  limits: { maxConnections?: number; fdsSoftLimit?: number };
  sources: Record<string, { present: boolean; errors?: number }>;
}): FirstSaturated;
```

CPU cores for a sample are `(proc.cpuTicks - prev.proc.cpuTicks) / 100 / dtSec` (the same formula `finishRunTelemetry` uses for the
chart). A resource whose source is absent or erroring on every sample is `observed: false` and appears in `absentSources`; it is never
saturated and never named.

`src/load/knee/knee-report.ts` (NEW):

```ts
export interface KneeReport {
  schema: 1;
  ruleId: "P6-RULE-006";
  caseId: string;
  runId: string;
  label: "knee range, environment-bound";
  verdict: "KNEE" | "NO_KNEE" | "INVALID";
  range?: { lowerStep: number; upperStep: number; lowerRate: number; upperRate: number }; // between step s and s+1 (s = last clean step)
  stop?: { step: number; rate: number; reasons: string[]; limitMs: number };
  firstSaturated?: { resource: string; step: number | null };
  stopRule: { smokeP95Ms: number; p95Factor: number; errorRate: number; minRequests: number };
  steps: StepStat[];
  conflicts: number;
  invalid: Array<{ code: string; detail: string }>;
  environment: string; // "ubuntu24 20261023.334.3, 4 vCPU" or "local"
  runUrl?: string;
}
export function buildKneeReport(input: {
  caseId: string;
  runId: string;
  steps: StepStat[];
  stop: StopVerdict;
  rule: StopRule;
  saturated: FirstSaturated;
  meta: RunMeta;
  conflicts: number;
}): KneeReport;
export function formatKneeTable(r: KneeReport): string; // markdown: header line with the range and reasons, one row per step, the first saturated resource; a plan that ended without a stop prints "no knee up to step N (rate R)" as a lower bound, here and in the job summary
/** Pure: knee-mode validity (§3.3). Returns the dropped-iteration reason for the first clean step short of its plan by more than the allowance, and `no_knee`/`knee_below_start`. */
export function kneeInvalidReasons(
  steps: StepStat[],
  stop: StopVerdict,
): Array<{ code: "dropped_iterations" | "no_knee"; detail: string }>;
```

A stop at step 0 is not a range ("below the start rate"). It is a plan error, so the stage returns a `TEST BUG` finding
`knee_below_start` ("the stop rule tripped at the first step; lower the start rate"), not an INVALID reason: the plan, not the
environment, is wrong. (`no_knee` is INVALID because the environment may simply be faster than the plan.)

`src/load/knee/stage.ts` (NEW): `kneeStage: Stage`. For every run of the case that has `spec.knee`: read `k6-<label>-summary.json`,
`stepStatsFromSummary`, `evaluateStopRule`; read `telemetry-<label>.json` if it exists and build `windows` from `p6_knee_t0_ms` (the
summary's Gauge `value`) and the plan; `firstSaturated`; `buildKneeReport`; the invalid reasons go to `ctx.invalid` as
`<label>: <code>: <detail>` for a run that expects VALID (as `validityStage` does); for a run with `expectValidity: "INVALID"` the
reasons must contain its `expectCodes`. Writes `knee-report-<label>.json` and `knee-report-<label>.md` after `findHits` on the text
(a hit removes the file and returns a TEST BUG). If `spec.knee.expect` is set (the self-test), a range other than
`[lowerRate, upperRate)` or another first saturated resource is a `TEST BUG` with both values. The k6 abort and the post-hoc
evaluation must agree: exit 99 with `stopStep === null`, or exit 0 with a stop step, is a TEST BUG. The stage also replaces the
dropped/VU codes of `validityStage` for knee runs: `validityStage` (`src/load/stages.ts`) gets a hook,
`spec.knee ? kneeValidityInput(summary, steps, stop) : summary`, where `kneeValidityInput` returns the summary with
`dropped = 0`, `peakVus = 0` (the per-step rule replaced them) so only the generator codes remain.

`src/load/telemetry/stages.ts` (CHANGED, two lines): in `samplerStart`, after `openSources`, `const ap = ctx.handles.appProcess as
AppProcess[] | undefined; if (ap) sources.appProcess = ap;`. The knee case sets that handle to the burn stub's process group.

`src/load/stub-server.ts` (CHANGED): `StubOptions.burnMs?: number`; in the request handler,
`if (o.burnMs) { const end = performance.now() + o.burnMs; while (performance.now() < end); }` before the existing delay; CLI fifth
argument `burnMs`. Unit test: a 5 ms burn makes 3 sequential answers take at least 15 ms in total; `burnMs` absent leaves
`stubDelayMs` unchanged.

`src/load/cases.ts` (CHANGED): `KNEE_RULE_006: LoadCase`:

```ts
export const KNEE_RULE_006: LoadCase = {
  id: "P6-X-LOAD-021",
  title:
    "Breakpoint method self-test (proves P6-RULE-006): a CPU-bound stub, a starved generator and a plan without a knee",
  product: "stub",
  label: "knee range, environment-bound",
  profiles: {
    pr: { rate: 60, durationSec: 60, maxLatencyMs: 200 }, // hold 10 s
    full: { rate: 60, durationSec: 110, maxLatencyMs: 200 }, // hold 20 s
  },
  telemetry: { product: "stub" },
  runs: (ctx) => [
    {
      label: "knee",
      script: "k6/selftest/breakpoint-stub.js",
      env: {},
      allowExits: [99],
      expectValidity: "VALID",
      knee: {
        startRate: 60,
        stepRate: 80,
        holdSec: hold(ctx),
        rampSec: 2,
        maxSteps: 5,
        smokeP95Ms: 6,
        maxVUs: 80,
        expect: { lowerRate: 140, upperRate: 220, firstSaturated: "app_cpu" },
      },
    },
    {
      label: "undersized",
      script: "k6/selftest/breakpoint-stub.js",
      env: {},
      allowExits: [0, 99],
      expectValidity: "INVALID",
      expectCodes: ["dropped_iterations"],
      knee: {
        startRate: 100,
        stepRate: 150,
        holdSec: hold(ctx),
        rampSec: 2,
        maxSteps: 3,
        smokeP95Ms: 30,
        maxVUs: 2,
      },
    },
    {
      label: "norule",
      script: "k6/selftest/breakpoint-stub.js",
      env: {},
      allowExits: [0],
      expectValidity: "INVALID",
      expectCodes: ["no_knee"],
      knee: {
        startRate: 100,
        stepRate: 150,
        holdSec: hold(ctx),
        rampSec: 2,
        maxSteps: 3,
        smokeP95Ms: 30,
        maxVUs: 100,
      },
    },
  ],
  stages: { setup, reconcile: kneeStage, cleanup },
};
```

`setup` starts two stub child processes with the node binary and `detached: true` (their own process group): the burn stub
(`src/load/stub-server.ts 0 0 0 1 5`) and the delay stub (`… 0 25 0 1`, no burn). It reads each child's first stdout line
(`stub on 127.0.0.1:<port>`), stores the ports in `ctx.config` (`ports.knee`, `ports.slow`), and the burn group in
`ctx.handles.appProcess = [{ recordPath: "", pgid: <child pid>, label: "stub" }]`. Each run's config gets its `port` from
`ctx.config.ports` (`knee` uses the burn stub; the other two the delay stub). `cleanup` sends SIGTERM to the groups
(`process.kill(-pgid)`), checks `/proc/<pid>` is gone and that the ports refuse connections. The runner owns these children; the harness
and the products are not involved.

### 6.5 Validity in knee mode, in one place

| Reason               | Source in knee mode                             | Rule                                                                        |
| -------------------- | ----------------------------------------------- | --------------------------------------------------------------------------- |
| `dropped_iterations` | per-step `started / planned` on **clean** steps | any clean step short by more than `max(2, floor(3 % of planned))` → INVALID |
| `vu_exhausted`       | not used                                        | replaced by the line above                                                  |
| `k6_cpu`             | `ResourceSummary.k6CoresAvg` whole run          | unchanged (> 0.5 × nproc)                                                   |
| `runner_cpu`         | whole run                                       | unchanged (> 85 %)                                                          |
| `runner_memory`      | whole run                                       | unchanged (< 10 % available)                                                |
| `telemetry_gap`      | sampler                                         | unchanged                                                                   |
| `clock_skew`         | marker                                          | unchanged                                                                   |
| `no_knee`            | `stopStep === null`                             | INVALID, "the plan ended without a stop: the knee is above step N"          |

### 6.6 The streaming reader and the chart

`src/load/chart/k6-points.ts` (CHANGED): add

```ts
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";

/** Same bins as readPointsGz, read line by line: memory stays at the per-second bins, however large the file. */
export async function readPointsGzStream(path: string): Promise<SecondBin[]> {
  const lines = createInterface({
    input: createReadStream(path).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  const collected: string[] = []; // only http_reqs / http_req_duration lines are kept
  for await (const line of lines) if (line.includes('"http_req')) collected.push(line);
  return aggregatePoints(collected);
}
```

(`aggregatePoints` already accepts any iterable; the filter keeps only the two metrics it reads, so memory is two lines per request.
For a 600,000-request run that is about 1.2 million short lines; if the build probe shows the array too large, aggregate incrementally by
second instead — the unit test fixes the output, not the method.) `finishRunTelemetry` (`src/load/telemetry/run.ts`) calls the stream
reader when the points file is larger than 20 MB, else the existing one. `render-chart.ts` takes `steps?: Array<{ index; rate; fromMs;
toMs }>` and draws a labelled band per step. Knee mode keeps `k6-<label>.json.gz` only when it is at most 25 MB; larger files are
removed after the chart is written and `verdict.json` says `pointsKept: false`.

### 6.7 Published form (`src/load/published.ts`, CHANGED)

```ts
/** "<lower> to <upper> iterations/s (knee range, environment-bound; stop rule: <reasons>; first saturated: <resource>; environment: <image> <version>, <n> vCPU; run-meta: <link>)". Throws if meta is not publishable or the report is not a KNEE. */
export function formatPublishedKnee(report: KneeReport, meta: RunMeta, metaLink: string): string;
```

README text (step 9): a section "How to read a knee" explaining the form above, the three words KNEE / NO_KNEE / INVALID, why a
knee is "between step s and s+1" with both rates, why the stop rule is not a gate, and the commands of §10. It never uses the bare
word "capacity".

### 6.8 Per-intent reconciliation (this task owns it; Tasks 2 to 6 cite it)

An **intent** is one started iteration, named by `exec.scenario.iterationInTest` (0-based, global across VUs). The three journeys already persist it:

| Product   | Where the intent is stored                                                                  | Source line                                            |
| --------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Cal       | attendee email ``attendeeEmail(cfg.prefix, `i${n}`)``, `n = exec.scenario.iterationInTest`  | `k6/journeys/cal-book.js:17` (index) and `:61` (email) |
| Medusa    | cart email `${iterationId(cfg.prefix, exec.scenario.iterationInTest)}@qa.local`             | `k6/journeys/med-checkout.js:39`                       |
| Documenso | document title `${iterationId(cfg.prefix, n)} journey`, `n = exec.scenario.iterationInTest` | `k6/journeys/doc-sign.js:22` (index) and `:37` (title) |

`iterationId(prefix, n)` is `${prefix}-i${n}` (`k6/lib/pure/prefix.js:31-32`). Probe of the contract (k6 2.3.0 on the VM, no product, 2026-10-25): at 500 iterations per second
2,001 `console.log` lines carried the distinct intents 0 to 2000, 0 of them unparsable; with `maxVUs 2`, a 50 ms iteration and `gracefulStop 0s`, `p6_step_started` was 146, `iterations` 144,
the log held 144 lines with intents 0 to 143, and `dropped_iterations` was 655: **dropped iterations take no intent number, and the started intents without a line are the interrupted
ones**. The summary export has **no** `iterations_interrupted` metric (its metric names were `vus vus_max dropped_iterations p6_step_started data_sent data_received iteration_duration
iterations`), so `interrupted = p6_step_started total − iterations`.

**Client side.** Each knee script runs its journey with `opts.onCommit`, a new optional member called at the exact lines where the journey adds to its commit counter (`acceptedCounter`,
`cal-book.js:83` and `:90`; `ordersCounter`, `med-checkout.js:195`, `:209` (`end(ordersCounter)`) and `:227`; `completedCounter`, `doc-sign.js:185`); no Phase 3 case passes it. After the journey the script calls
`endKneeIteration(intent, committed)`, which writes one line with `console.log`:

```text
{"intent":3,"outcome":"ok"}                      committed: the client counted the commit
{"intent":4,"outcome":"fail"}                    finished without the commit and the client got HTTP answers
{"intent":5,"outcome":"fail","net":true}         finished without the commit and a response had status 0 (timeout or reset): the commit is unknown
```

k6 writes it to stderr, which `runK6` captures in `k6-<label>.log` (`src/load/k6-process.ts`, `stdio: ["ignore", out, out]`), as
`time="…" level=info msg="{\"intent\":3,\"outcome\":\"ok\"}" source=console` (probed). The log is an allowed evidence kind (`.log`). An iteration k6 interrupted has no line.

**Runner side** (`src/load/knee/intents.ts`, pure):

```ts
export type IntentOutcome = "ok" | "fail";
export interface IntentLog {
  outcomes: Map<number, { outcome: IntentOutcome; net: boolean }>;
  duplicateLines: number[]; // an intent that has two lines: TEST BUG
  beyondStarted: number[]; // an intent >= started: TEST BUG
}
export function parseIntentLog(logText: string, started: number): IntentLog;
/** Started set = 0..started-1. ok / fail / indeterminate (no line, or fail with net:true). */
export function classifyIntents(
  log: IntentLog,
  started: number,
): { ok: number[]; fail: number[]; indeterminate: number[]; noLine: number[] };
export interface IntentAudit {
  findings: Array<{ kind: "PRODUCT BUG" | "TEST BUG"; text: string; knownBugId?: string }>; // ids and counts only
  counts: {
    started: number;
    ok: number;
    fail: number;
    indeterminate: number;
    ghostRows: number;
    duplicateRows: number;
  };
}
/** rowsByIntent: rows per intent; ghostRows: rows whose label maps to no started intent. */
export function auditByIntent(input: {
  started: number;
  log: IntentLog;
  rowsByIntent: Map<number, number>;
  ghostRows: number;
  interrupted: number;
  /** Set by a product whose known bug is exactly rule 4 (Medusa F-M2): a `fail` intent with 1 row is then counted under this id, not a violation. */
  failWithRowKnownBugId?: string;
}): IntentAudit;
```

**Rules** (every one has a test in `reconcile-intents`, §12):

1. A database row that maps to no started intent is a **ghost write**: `PRODUCT BUG (SUSPECTED)`.
2. An intent with more than one row is a **duplicate write**: `PRODUCT BUG (SUSPECTED)` (the count slack of the first draft would have hidden up to `interrupted` of them).
3. An `ok` intent must have exactly 1 row; with 0 rows the client was told success for work that is not there: `PRODUCT BUG (SUSPECTED)`.
4. A `fail` intent (without `net`) must have 0 rows: with 1 row the client was told failure for committed work: `PRODUCT BUG (SUSPECTED)`, unless the product passes `failWithRowKnownBugId` (Medusa: `F-M2`, a checkout that answers 400 and leaves an order), in which case each such intent is counted once under that id and is not a violation. Duplicates and ghost rows are never counted under a known bug.
5. Only an indeterminate intent (no line, or `fail` with `net: true`) may have 0 or 1 row. The intents with no line must number at most `interrupted`; more is a `TEST BUG` (a
   journey that finishes without a line, or a lost log).

`makeReconcileStage` (`src/load/reconcile/index.ts`) passes `counters.intents = { started, interrupted, log }` to `reconcile()` when the run has `spec.knee` (`started` from `p6_step_started`, `interrupted` as above,
`log` from `parseIntentLog` over the run's `stdoutPath`); with `intents` present `evaluateCalAudit` and `evaluateMedusaAudit` replace their count checks (`client-matches-db`, `no-ghost-orders`) by the five rules. The product plans supply `rowsByIntent`: the row-to-intent mapping is a read-only SELECT per product (Cal: attendee emails of accepted and pending bookings; Medusa: order emails;
Documenso: envelope titles), written with `assertSelectOnly` in the plan of that product. The old `client-matches-db` check stays for the non-knee runs of Phase 3. **UNPROBED, in the
first `load-knee-selftest` CI run:** whether `gracefulStop` drains in-flight iterations after an `abortOnFail` stop. The measurement: compare `p6_step_started`, the outcome-line count and
`iterations` in `k6-knee-summary.json` and `k6-knee.log` (the plan does not rely on either answer: an iteration without a line is indeterminate either way).

## 7. Oracles and assertions

This task has no product oracle. Its correctness contract is the self-test's, evaluated by `kneeStage` from the three summaries:

| Run          | Must show                                                                             | Probe value                                 | Margin                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `knee`       | verdict KNEE, range `[140, 220)`, stop reason `p95`, first saturated `app_cpu`, VALID | stop at step 2 of 5, CPU 0.78 → 1.0         | last clean step 140/s = 70 % of the limit (200/s), stop step 220/s = 110 %; the CPU level 0.9 is 0.12 above the clean 0.78 |
| `undersized` | INVALID with `dropped_iterations` (and also `no_knee`: nothing tripped)               | started 666 of 1000                         | 1000 planned: short by 334 against an allowance of 30                                                                      |
| `norule`     | INVALID with `no_knee` only                                                           | started 1000 / 2500 / 3999 of 4000, no trip | all steps within 0.01 of plan                                                                                              |

**PRODUCT BUG vs TEST BUG.** There is no product. A range that does not contain the stub's limit, a disagreement between the k6 exit
code and the post-hoc rule, or a report that fails its unit test is a **TEST BUG**, reported with the numbers. A noisy runner that
shifts the stop one step lower is INVALID or a TEST BUG with evidence, never a widened margin; the margins above are the plan's and
change only with new probe data and an owner decision. No expected-failure marker, no skip.

## 8. Data isolation, cleanup, leak check

No product data. The run directory is `results/load/P6-X-LOAD-021/<run id>/` (git-ignored). The runner starts two stub children in their
own process groups and stops them in `cleanup`; the leak check asserts no process of those groups remains (`/proc`) and both ports
refuse a connection (as Phase 3 Task 3 does for its in-process stub). Reports and telemetry carry counts and rates only; the token scan
runs over the run directory in the `tokenScan` stage and `findHits` runs over each report before it is written.

## 9. CI, token scan, budget

New job `load-knee-selftest` in `.github/workflows/perf.yml` on every event (PR, push, dispatch, schedule), product-free, own
timeout (35); no existing job changes and no timeout is raised. The steps copy `load-selftest` (same file, `perf.yml` lines 2263 to 2330) step for step, with the same caps.
Durations of the copied steps are read from the jobs API (`https://api.github.com/repos/Jayami123/k6-load-concurrency-suite/actions/runs/<run id>/jobs`, no
authentication) for the three evidence runs of release `p6-phase3`: 40177412186, 40178773022 and 40180625279 (`load-selftest` job, id 121130735846 in the last one). The table
uses the maximum over the three runs.

| step name (as in YAML)                                             | timeout-minutes | estimate (source)                                                             | 80 % stop | runs on this event? |
| ------------------------------------------------------------------ | --------------- | ----------------------------------------------------------------------------- | --------- | ------------------- |
| `actions/checkout@3d3c42e5…` (v7.0.1)                              | 2               | 2 s (max of the 3 runs; step "Run actions/checkout")                          | 96 s      | all four events     |
| `actions/setup-node@949feb24…` (v7.1.0)                            | 3               | 3 s (max of the 3 runs)                                                       | 144 s     | all four events     |
| Install P6 dependencies                                            | 3               | 9 s (max of the 3 runs)                                                       | 144 s     | all four events     |
| Install k6 (pinned in .k6-version, checksum-verified)              | 2               | 1 s (max of the 3 runs)                                                       | 96 s      | all four events     |
| Knee self-test (P6-X-LOAD-021)                                     | 6               | UNPROBED: VM 150 s (pr profile), 240 s (full profile); runner in first CI run | 288 s     | all four events     |
| Job summary (LOAD table)                                           | 2               | 1 s (max of the 3 runs)                                                       | 96 s      | all four events     |
| Check artefacts for tokens (`id: token_scan`)                      | 1               | 0 s (max of the 3 runs)                                                       | 48 s      | all four events     |
| `actions/upload-artifact@cf430e03…` (v7.0.2), `load-knee-selftest` | 3               | 2 s (max of the 3 runs)                                                       | 144 s     | all four events     |

Sum of the step caps: 2 + 3 + 3 + 2 + 6 + 2 + 1 + 3 = **22 min**. Job timeout **35**. 35 − 22 = **13 ≥ 10**. (The old text "worst at caps 21, margin 14" is replaced by this table.)
The self-test step estimate (VM, three runs: `knee` about 45 s, `undersized` and `norule` about 40 s each, each plus about 10 s of setup, stub start, telemetry and report in the
pr profile; 22 s steps in the full profile) is UNPROBED on the runner: **confirm in the first CI dispatch**. A measured duration above 80 % of a cap is a stop and report; the fix is a
shorter hold or fewer steps, never a higher cap or timeout. Artefact `load-knee-selftest` (retention 14 days, as every `perf.yml` upload): `verdict.json`, `run-meta.json`,
`k6-<label>-summary.json`, `k6-<label>.log` (which carries the intent lines of §6.8), `k6-<label>.json.gz`, `telemetry-<label>.{json,csv}`, `chart-<label>.html`,
`knee-report-<label>.{json,md}`. The token scan (`node scripts/evidence-token-scan.mjs results/load`) runs before the upload. None of the existing job budgets change.

## 10. Expected output of the self-test run

```text
$ npm run load:knee-selftest -- --profile pr
P6-X-LOAD-021 (knee range, environment-bound) run 20261025T120000Z-3fa9c0d1
  setup        ok   burn stub pid 4711 (own group), delay stub pid 4712
  k6 knee      exit 99  steps 0..2 of 5 (stopped), stop step 2 (220/s) p95 339 ms >= 60 ms
  k6 undersized exit 0  steps 3 of 3, started 666 of 1000 in step 0
  k6 norule    exit 0   steps 3 of 3, no stop
  knee         KNEE  between step 1 (140/s) and step 2 (220/s); stop: p95; first saturated: app_cpu (step 2)
  undersized   INVALID dropped_iterations, no_knee
  norule       INVALID no_knee
  tokenScan    ok   clean
  verdict      PASS  results/load/P6-X-LOAD-021/20261025T120000Z-3fa9c0d1/verdict.json
```

(Numbers are VM values from §3; the run ids and times differ.) Standalone, no runner:
`node src/load/stub-server.ts 18080 0 0 1 5` then `P6_LOAD_CONFIG=k6/selftest/breakpoint-stub.example.json k6 run
k6/selftest/breakpoint-stub.js`; exit 99 with the threshold line of §3.1.

## 11. Environment changes (exact steps)

None for Cursor Cloud (`.cursor/environment.json`, `.cursor/Dockerfile`) or Claude Code cloud (setup script,
`.claude/hooks/session-start.sh`). Nothing is pasted by hand; no repo setting changes. Cloud VM note (not a change): on the Claude Code cloud VM, whose
`/sys/fs/cgroup` is `tmpfs`, the database container source reads nothing; on the GitHub runner it reads (30 of 30 files, §3.8 item 2). The report lists an absent source as absent.

## 12. Build order (one commit per step; `npm run check` after each)

Run from the repo root with `export PATH="/usr/local/bin:$PATH"`. Branch: `git switch -c feat/<build date>-p6-breakpoint-method origin/main`.
Counts are relative to B1 (§5 check 2).

| Step | Commit subject                                                                         | `git add` paths                                                                                                                                                                                                                                                                                                                                                                                                                         | Expected (`npm run check`)                                               |
| ---- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 0    | `docs(plans): bring the phase 4 task 1 plan onto the build branch`                     | `docs/plans/2026-10-25-p6-phase4-task1-breakpoint-method.md`                                                                                                                                                                                                                                                                                                                                                                            | exit 0, B1                                                               |
| 1    | `feat(k6): add the knee plan, stop thresholds, response classifier and intent line`    | `k6/lib/pure/knee.js tests/unit/k6-lib-knee.test.ts`                                                                                                                                                                                                                                                                                                                                                                                    | exit 0, **B1 + 9**; `k6 inspect` ok                                      |
| 2    | `feat(load): read the per-step statistics of a knee run`                               | `src/load/knee/step-stats.ts tests/unit/knee-step-stats.test.ts src/load/types.ts`                                                                                                                                                                                                                                                                                                                                                      | exit 0, **B1 + 13**                                                      |
| 3    | `feat(load): add the stop rule and the first saturated resource rule`                  | `src/load/knee/stop-rule.ts src/load/knee/first-saturated.ts tests/unit/knee-stop-rule.test.ts tests/unit/knee-first-saturated.test.ts`                                                                                                                                                                                                                                                                                                 | exit 0, **B1 + 27**                                                      |
| 4    | `feat(load): add the knee report, its validity and the published form`                 | `src/load/knee/knee-report.ts src/load/published.ts tests/unit/knee-report.test.ts tests/unit/knee-validity.test.ts tests/unit/load-published.test.ts`                                                                                                                                                                                                                                                                                  | exit 0, **B1 + 39**                                                      |
| 5    | `feat(load): parse and bound the knee plan inputs`                                     | `src/load/knee/plan-input.ts tests/unit/knee-plan-input.test.ts`                                                                                                                                                                                                                                                                                                                                                                        | exit 0, **B1 + 43**                                                      |
| 6    | `feat(load): reconcile the audits per intent after a stop`                             | `src/load/knee/intents.ts src/load/reconcile/index.ts src/load/reconcile/cal.ts src/load/reconcile/medusa.ts src/load/reconcile/types.ts tests/unit/knee-intents.test.ts tests/unit/reconcile-intents.test.ts`                                                                                                                                                                                                                          | exit 0, **B1 + 52**; the existing reconcile tests unchanged              |
| 7    | `feat(load): sample the host cpu and the database connection limit`                    | `src/load/telemetry/host-stats.ts src/load/telemetry/sampler.ts tests/unit/telemetry-host.test.ts`                                                                                                                                                                                                                                                                                                                                      | exit 0, **B1 + 55**; the existing sampler tests unchanged                |
| 8    | `feat(load): add a cpu-burn mode to the stub`                                          | `src/load/stub-server.ts tests/unit/stub-server-burn.test.ts`                                                                                                                                                                                                                                                                                                                                                                           | exit 0, **B1 + 57**                                                      |
| 9    | `feat(k6): add the knee library, the commit hooks and the breakpoint self-test script` | `k6/lib/knee.js k6/lib/http.js k6/journeys/cal-book.js k6/journeys/med-checkout.js k6/journeys/doc-sign.js k6/selftest/breakpoint-stub.js k6/selftest/breakpoint-stub.example.json tests/unit/knee-journey-hooks.test.ts`                                                                                                                                                                                                               | exit 0, **B1 + 58**; `k6 inspect: N script(s) ok.` (N + 2)               |
| 10   | `feat(load): add the knee stage, the streaming points reader and the self-test`        | `src/load/knee/stage.ts src/load/chart/k6-points.ts src/load/chart/render-chart.ts src/load/telemetry/stages.ts src/load/telemetry/run.ts src/load/run-meta.ts src/load/runner.ts src/load/stages.ts src/load/cases.ts scripts/write-ci-job-summary.ts package.json tests/unit/knee-stage.test.ts tests/unit/load-cases-knee.test.ts tests/unit/k6-points-stream.test.ts tests/unit/render-chart.test.ts tests/unit/load-table.test.ts` | exit 0, **B1 + 68**; `npm run load:knee-selftest -- --profile pr` exit 0 |
| 11   | `ci(perf): run the knee self-test in its own job`                                      | `.github/workflows/perf.yml`                                                                                                                                                                                                                                                                                                                                                                                                            | exit 0 (actionlint silent), B1 + 68                                      |
| 12   | `docs: explain how to read a knee`                                                     | `README.md`                                                                                                                                                                                                                                                                                                                                                                                                                             | exit 0 (`readme-rules` green), B1 + 68                                   |

New unit tests by name (68): `k6-lib-knee` (9: plan shape with `timeUnit "10s"` targets, stages and bad input rejected; `stepAt` hold, ramp, boundary, after the end; `kneeVus` sizing,
minimum and cap; `stopRuleThresholds` keys, `p(95)<X`, `rate<=0.01`, `abortOnFail`, empty submetric lists; `classifyResponse` Cal; Medusa; Documenso with a 429; `standardOptions` still
throws on `http_req_duration`; **`intentLine` output parses back with the regex of `parseIntentLog`**); `knee-step-stats` (4: full summary; Rate `passes` is the error count; missing step is not
reached and counts 0; planned = rate x hold); `knee-stop-rule` (6: p95 equal to the limit trips; just below does not; error rate exactly 1 % does not, 1.01 % does; under `minRequests` is ignored;
first step wins; reasons list error_rate before p95); `knee-first-saturated` (8: cores from ticks; half of the samples; a blip that later recovers is not saturated; tie broken by priority;
`db_wait`; `none_observed`; absent source listed and never named, edge trimming; **the run-relative `app_cpu` level of §3.9 R2 and `runner_cpu`**); `knee-report` (7: range is last clean to
stop step; stop at step 0 is a TEST BUG finding; no stop is `NO_KNEE`; a clean step short of its plan by more than the allowance is INVALID, with the floor of 2 at 15 planned iterations; the
stop step's drops are ignored; markdown table, including the `no knee up to step N (rate R)` lower-bound line of Q6; JSON passes `findHits`); `knee-validity` (3: dropped replaced by the per-step rule; `no_knee`; generator codes still apply); `load-published`
(2: knee string has range, rule, resource, environment; refuses a non-KNEE and a non-publishable meta); `knee-plan-input` (4: defaults for empty strings; one-decimal rates; bounds and the
5,000-iteration cap name the field; non-numeric input is rejected); **`knee-intents` (3: `parseIntentLog` reads k6 console lines with escaped quotes and ignores every other line; a repeated
intent line and a line with an intent at or above `started` are reported as TEST BUG findings; a `fail` line with `net: true` is classified indeterminate, a plain `fail` is not)**;
**`reconcile-intents` (6, §6.8: a duplicate that the old count slack would have hidden is a finding; a ghost row (an intent never started, or a label that maps to no intent) is a finding; an
indeterminate intent with 0 rows or 1 row passes; an `ok` intent with 0 rows is a finding; a `fail` intent with 1 row is a finding, and is counted under the known-bug id instead when `failWithRowKnownBugId` is set; more indeterminate intents than `interrupted` is a TEST BUG)**;
**`knee-journey-hooks` (1: in each of the three journey files every line that adds to the commit counter (`.add(1)` on it, or `end(ordersCounter)`) is followed by an `opts.onCommit` call inside the same block, and the Phase 3 cases
never pass `onCommit`)**; `telemetry-host` (3: busy fraction from two `/proc/stat` reads; first sample has none; `MemAvailable` parsed); `stub-server-burn` (2); `knee-stage` (4: happy fixture
writes json and md; expected-range mismatch is a TEST BUG; exit 99 with no stop step is a TEST BUG; a token-like value is not kept); `load-cases-knee` (2: the case and its three runs;
`package.json` has the script); `k6-points-stream` (2: equals the sync reader on a fixture; handles a file larger than one chunk); `render-chart` (+1: step bands); `load-table` (+1: knee block).
Count: 9 + 4 + 6 + 8 + 7 + 3 + 2 + 4 + 3 + 6 + 1 + 3 + 2 + 4 + 2 + 2 + 1 + 1 = **68** (steps: 1 → +9, 2 → +4, 3 → +14, 4 → +12, 5 → +4, 6 → +9, 7 → +3, 8 → +2, 9 → +1, 10 → +10). The
first draft had 61 with four slack tests; the per-intent contract replaces them with six, adds the log parser (3), the `intentLine` round trip (1) and the hooks guard (1).

After step 12: `git push -u origin feat/<build date>-p6-breakpoint-method`, `gh pr create` (rule 3), read CI once (rule 15): `load-knee-selftest`
green on the PR; once more on `main` after the merge (roadmap done-when). Merge only when the owner says "merge".

## 13. Risks, proposed extras, open decisions

| ID  | Risk                                                                   | Mitigation                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | A noisy runner trips the stop rule one step early in the self-test     | the clean steps are ≤ 70 % of the stub's limit; a TEST BUG with numbers, never a widened margin                                                                             |
| R2  | A transient stall trips a product step early (few samples at low rate) | `minRequests` 20 and `delayAbortEval`; the product plans set hold so a step has ≥ 100 requests; ≥ 3 runs expose the spread                                                  |
| R3  | `exec.vu.tags` has a per-iteration cost                                | the Phase 3 overhead relations (`P6-X-LOAD-006`) are re-run in the same CI job family; the stub run shows the sampler/generator CPU in `ResourceSummary`                    |
| R4  | The synchronous points reader breaks on a large run                    | §3.4; streaming reader, 25 MB keep rule                                                                                                                                     |
| R5  | `observeResponses` misses a request that bypasses `request()`          | only the doc-sign multipart create does; handled by `observe()`; a build check greps `k6/journeys` for direct `http.get`/`http.post` calls (proposed extra `P6-X-LOAD-023`) |
| R6  | The README word test blocks natural phrasing                           | use "knee range"; the test is not weakened                                                                                                                                  |

**Contradictions with the roadmap.**

| #   | Roadmap says                                                                                      | Probe shows                                                                          | Effect                                                         |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| C1  | "`ALREADY_SIGNED` … are conflicts, not errors"                                                    | it is a 200 by design (README), never a 4xx                                          | Documenso has no conflict class; §3.5                          |
| C2  | "`k6/lib/breakpoint.js`"                                                                          | the repo layout puts pure builders in `k6/lib/pure/` and k6-facing code in `k6/lib/` | `k6/lib/pure/knee.js` + `k6/lib/knee.js`                       |
| C3  | "`scripts/load/run-load.ts` (knee mode)"                                                          | the runner is generic; the mode is a stage plus `K6RunSpec.knee`                     | `scripts/load/run-load.ts` unchanged; `src/load/knee/stage.ts` |
| C4  | "INVALID if the generator saturates"                                                              | `dropped_iterations` also occurs at the stop step                                    | per-step rule, §3.3                                            |
| C5  | stop rule from "the LOAD runner; k6 aborts (`abortOnFail`, or the runner stops k6; plan decides)" | option A works and is standalone                                                     | k6 aborts; the runner re-evaluates and must agree              |
| C6  | "k6 aborts on the rule" with k6 thresholds                                                        | `assertCorrectnessThresholds` forbids latency thresholds (RULE-001, D9)              | separate `stopRuleThresholds`, §3.7                            |
| C7  | rates are iterations per second                                                                   | k6 accepts whole targets only; Medusa's steps are 0.5, 1.0, 1.5                      | `timeUnit` 10 s, rates with one decimal (§3.9 R1)              |
| C8  | the post-load audit after the stop                                                                | in-flight iterations committed work the client never saw                             | audits reconcile per intent, not by count (§3.9 R3, §6.8)      |

**Proposed extras (out of scope until accepted; new IDs).**

- `P6-X-LOAD-022`: run the `knee` leg three times in CI and assert the three ranges are identical (the A/A seed for Phase 4b Task 11).
- `P6-X-LOAD-023`: a unit test that fails when a `k6/journeys/*.js` calls `http.get`/`http.post` directly (keeps `observeResponses` complete).

(Ids: `grep -rhoE "P6-X-LOAD-0[0-9][0-9]" docs src k6 tests README.md | sort -u` on the merged branch lists `-001` to `-020`: `-009` Phase 5, `-010` and `-011` Phase 3 Task 3,
`-012` Phase 3 Task 4, `-013` and `-014` Phase 3 Task 5, `-015` and `-016` Phase 3 Task 6, `-017` Task 7, `-018` Task 8, `-019` Task 9, `-020` Task 10 (each a proposed extra). The next free
number is therefore **`-021`**, which is the self-test case id; the extras of this plan take `-022` and `-023`. The Phase 3 Task 11 plan's own extras are numbered `-012` and `-013` in the
file on main and collide with Phase 3 Tasks 4 and 5; that file is not edited here, and Task 11 shipped neither.)

**Decisions (owner, 2026-10-25).**

- **Q1. Stop mechanism.** Decided (owner, 2026-10-25): (a) k6 aborts on per-step thresholds and the runner re-evaluates — the §3.1 probe shows it works and runs standalone.
  Options considered: (a) k6 aborts on per-step thresholds and the runner re-evaluates (§3.1); (b) one k6 process per step; (c) the runner stops k6 from streamed output.
- **Q2. Points file in knee mode.** Decided (owner, 2026-10-25): (a) streaming reader, at most 25 MB kept in the Actions artefact, never in the release — the exclusion is already enforced on main
  (PR #63, no `.gz` kind in the allowlist) and the artefact now lives 90 days in `knee.yml` (Task 2 Q6).
  Options considered: (a) streaming reader, keep ≤ 25 MB in the artefact, never in the release (§3.4); (b) no `--out json` in knee mode (no per-second request chart).
- **Q3. Primary stop reason when both trip in one step.** Decided (owner, 2026-10-25): (a) list both, `error_rate` first — it follows D2's wording.
  Options considered: (a) list both, `error_rate` first; (b) p95 first.
- **Q4. RSS as a saturation resource.** Decided (owner, 2026-10-25): (a) context series only — nothing outside the process knows its memory limit (harness H2 is Phase 5).
  Options considered: (a) context series only (§3.6 point 5); (b) a level of 90 % of a memory limit.
- **Q5. The self-test LOAD case id.** Decided (owner, 2026-10-25): (b) a new `P6-X-LOAD-0nn` id whose description says it proves `P6-RULE-006` — the repo keeps case ids and rule ids apart: every existing
  self-test case is `P6-X-LOAD-nnn` (`src/load/cases.ts`: `-001`, `-002`, `-004`, `-006`) and no case uses a `P6-RULE` id. The next free number is **`P6-X-LOAD-021`** (grep result in §13: `-009` to `-020` are
  taken or proposed; `-017` to `-020` are proposed extras of Phase 3 Tasks 7 to 10, so `-017` is not free).
  Options considered: (a) `P6-RULE-006` (the old default); (b) a new `P6-X-LOAD-0nn` id. Evidence: ids `-009` (Phase 5), `-010` and `-011` (Phase 3 Task 3) and the others above are taken.
- **Q6. A plan that ends without a stop.** Decided (owner, 2026-10-25): (a) INVALID `no_knee`; the report and the job summary print "no knee up to step N (rate R)" as a lower bound — "above step N" is a
  lower bound, not a knee. Options considered: (a) INVALID `no_knee`; (b) report `NO_KNEE` as a result.
- **Q7. Audits after a stop (new).** Decided (owner, 2026-10-25): per-intent reconciliation replaces the count slack (§6.8) — a count slack lets up to `interrupted` duplicate or ghost writes pass unseen, which is
  the bug class this suite exists to find. UNPROBED — confirm in the first `load-knee-selftest` CI run: whether `gracefulStop` drains in-flight iterations after an `abortOnFail` stop (compare `p6_step_started`,
  the outcome lines and `iterations`).
  Options considered: (a) `0 <= database - client <= interrupted` (the first draft); (b) per-intent reconciliation with indeterminate intents.

## 14. Done when (roadmap, made measurable)

- [ ] `npm run check` exit 0 with **B1 + 68** unit tests; the new tests cover the stop rule, the report, the first-saturated rule and the per-intent audit from fixtures.
- [ ] `npm run load:knee-selftest -- --profile pr` exits 0 on a VM, `knee-report-knee.md` says "between step 1 (140/s) and step 2 (220/s)"
      (values from the plan constants), first saturated `app_cpu`; `undersized` and `norule` are INVALID with their codes.
- [ ] The job `load-knee-selftest` is green on the PR and once on `main` after the merge; the artefact holds the reports and the chart.
- [ ] `k6 run k6/selftest/breakpoint-stub.js` works standalone (D6) with the example config; exit 99 and the threshold line.
- [ ] The report meets `P6-RULE-006` (case `P6-X-LOAD-021`): a step range with both rates, the stop reasons, the run id and environment label, the first
      saturated resource from the rule (or `none_observed` / the absent sources); README "How to read a knee" is in.

## 15. Rule 20 self-check

- (a) Roadmap "Done when": unit tests (§12), stub self-test in CI on the PR and on `main` (§9, §14), report format (§6.4, §6.7), standalone
  `k6 run` (§10, §14), `npm run check` green. Gap: the first-saturated rule is proven on fixtures plus the stub's CPU; product
  resources are exercised in Tasks 2 to 4.
- (b) Existing names grepped on `main` at `2db9726` (all present): `rampingOpenScenario`, `assertCorrectnessThresholds`, `standardOptions`,
  `SYSTEM_TAGS` in `k6/lib/pure/options.js`; `judgeValidity` and `VALIDITY_LIMITS`; `validityStage`, `runAllK6` in `src/load/stages.ts`;
  `readPointsGz`, `aggregatePoints`; `samplerStart`, `openSources`; `finishRunTelemetry`; `startStub`, `stubDelayMs`; `evaluateVerdict`;
  `CAL_REDACTED`, `classifyAttempt`; `classifyRefusal`; `formatPublishedNumber`. NEW with skeletons: every file marked NEW in §6.1.
- (c) CI time: §9 (exact table, 22 min of caps in a 35-minute timeout, margin 13); no existing timeout raised; full-profile estimate under
  the 80 % stop rule.
- (d) Skeletons §6; steps with `git add` paths, subjects and expected output §12.
- (e) Every owner answer is recorded in "Decisions (owner, 2026-10-25)" (§13); Q7 is the per-intent audit decision added on 2026-10-25.
