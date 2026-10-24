# P6 Phase 3 Task 3: load foundation, one pinned k6 and the workload library (`P6-X-LOAD-001`) (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Structure follows
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md). Scope source: roadmap
[2026-10-22-p6-phase3-roadmap.md](2026-10-22-p6-phase3-roadmap.md) (on `origin/plan/2026-10-22-p6-phase3`), "Task 3", D1, D3,
D6, D9, D11, "Rules that hold for every task". **Tasks 4 to 10 build on the interfaces fixed in §6.2 to §6.6 of this plan**
(runner, stage pipeline, file formats, library API); they must not invent their own.

## 1. Header

- **Task.** Phase 3 Task 3. Case: `P6-X-LOAD-001` (P0), open-model workload library and the coordinated-omission stub self-test.
- **Plan branch.** `plan/2026-10-24-p6-phase3-plans` (no PR, never deleted).
- **Build branch (pattern).** `feat/<build date>-p6-load-foundation`.
- **Base.** `origin/main` = `5acd2a0` (merge of PR #51; contains PR #50, `a82521a`).
- **Harness pin assumed.** Any: this task starts no product. (`v0.2.12` today; Task 1 may bump it first.)
- **Environment change: yes** (one pinned k6 in CI and both clouds, §11). Stop for owner review: yes (rule 10: CI workflow, k6 pin).
- **Pinned k6.** `2.3.0` (§3.2), in a new `.k6-version` file.
- **Unit tests.** B = count on main when the build starts (today's chain: 503 after Tasks 1 and 2). This plan adds **+51** (§12). Expected after the build: B + 51 (**554** today). Chain in merge order: 471 -> T1 481 -> T2 503 -> T3 554 -> T4 597 -> T5 653 -> T6 686 -> T7 702 -> T8 719 -> T9 743 -> T10 777.
- **Owner decisions taken (2026-10-24, recorded, not open).** Q1 pin k6 2.3.0. Q2 `k6/lib` stays JavaScript for now. Q3 the hook downloads k6 automatically and warns on failure. Q4 accept (INVALID handling is then set by Task 4 Q1: a warning with a green job). Q5 accept. `twenty-smoke` keeps its existing `grafana/setup-k6-action` step, pinned to `.k6-version` (§6.8). `load-selftest` keeps its 20-minute timeout for the whole phase; Task 5's two self-tests run in `load-overhead`. All questions are closed in §13.
- **Priority.** P0 (roadmap).

## 2. What it proves

- **Latency is measured the way users arrive.** An open-model generator keeps sending at the planned rate while the system
  stalls; a closed-model generator waits for each reply and quietly sends fewer requests exactly when the system is slow, so it
  under-reports the slow period ("coordinated omission"). The stub self-test makes that visible, with numbers (§3.5).
- **Finance and healthcare.** A payment API or a patient-portal login measured closed-model reports a healthy p95 while a
  thousand real users wait behind a stall. The same rule decides whether an audited latency figure can be trusted.
- **One tool version everywhere.** A number from CI, from the Cursor image and from the Claude Code cloud image comes from the same
  checksum-verified k6, so a difference is the product's, not the tool's.

## 3. Live probe evidence

Probe date 2026-10-24 (UTC), cloud VM (Node v22.23.3, 4 vCPU, 16 GB RAM, Ubuntu 24.04.5, root). Timings are **VM, proof only**.
No product was needed except where stated. Throwaway files live in `/tmp` and are not committed.

### 3.1 The k6 version in every environment today (roadmap probe items 1 and 3)

| Environment             | How k6 gets there                                                                                 | Version today                                                                                      | Evidence                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI (`perf.yml`)         | `grafana/setup-k6-action@43b9fc21…` (v1.2.2) with `k6-version: ${{ env.K6_VERSION }}` in six jobs | **1.8.2** (`K6_VERSION: "1.8.2"`, line 31)                                                         | `grep -n "K6_VERSION\|setup-k6" .github/workflows/perf.yml` → lines 31, 89/91, 291/293, 465/467, 639/641, 1126/1128, 1336/1339                                          |
| Cursor Cloud            | `.cursor/Dockerfile`: Grafana apt repo `stable`, `apt-get install -y k6`, **unpinned**            | the newest in the repo when the image was built: **2.3.0** today (matches the maintainer's report) | `curl -sS https://dl.k6.io/deb/dists/stable/main/binary-amd64/Packages \| grep -E '^(Package\|Version):' \| paste - -` → versions 1.8.2, 2.0.0, 2.0.0~rc1, 2.2.0, 2.3.0 |
| Claude Code cloud       | a binary baked into the base image, **not** from a package and not from a repo file               | **1.3.0**                                                                                          | `which k6` → `/usr/local/bin/k6`, `-rwxr-xr-x 1 1001 1001 67140051 Sep 23  2025`; `dpkg -S` finds no package; `k6 v1.3.0 (commit/5870e99ae8, go1.25.1, linux/amd64)`    |
| The maintainer's report | "2.3.0 on the cloud images"                                                                       | 2.3.0 (true for the Cursor image only)                                                             | above                                                                                                                                                                   |

So three environments run three versions (1.8.2, 2.3.0, 1.3.0). Roadmap Note 8 is settled.

### 3.2 The pin: latest stable, installable the same way everywhere

```text
$ for v in 1.8.2 1.9.0 1.10.0 2.0.0 2.1.0 2.2.0 2.3.0 2.3.1 2.4.0 3.0.0; do curl -sS -o /dev/null -w "v$v %{http_code}\n" https://github.com/grafana/k6/releases/download/v$v/k6-v$v-checksums.txt; done
v1.8.2 302   v1.9.0 404   v1.10.0 404   v2.0.0 302   v2.1.0 302   v2.2.0 302   v2.3.0 302   v2.3.1 404   v2.4.0 404   v3.0.0 404
```

`v2.3.0` is the newest release (`v2.3.1` and `v2.4.0` do not exist; the apt `Packages` index agrees). It is a major jump from 1.8.2, so the
release notes were read from the k6 repo (`git clone --filter=blob:none --sparse https://github.com/grafana/k6.git` +
`git sparse-checkout set "release notes"`, files `v2.0.0.md` to `v2.3.0.md`). What changed that P6 could touch:

| Change in v2.0.0                                                                                                                       | P6 uses it?                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `externally-controlled` executor, `k6 pause/resume/scale/status`, `k6 login`, `--upload-only` removed                                  | no                                                                                   |
| `--no-summary` removed (use `--summary-mode=disabled`); `--summary-mode=legacy` removed                                                | no (`grep -rn "no-summary\|summary-mode" scripts k6 package.json .github` → nothing) |
| `k6/experimental/redis` removed; `options.ext.loadimpact` removed; HTTP API server no longer starts by default (`--address` to enable) | no                                                                                   |
| Go module path `go.k6.io/k6/v2` (extensions only)                                                                                      | no extensions                                                                        |
| New in 2.3.0: `k6 run --scenario <name>` (run selected scenarios), `--once`                                                            | useful for the standalone debug commands of D6 (§6.9)                                |

Live checks on the three binaries (1.3.0 here, 1.8.2 and 2.3.0 downloaded to `/tmp`):

```text
$ k6 inspect k6/*/*.js        (5 scripts)        v1.3.0: ok x5     v2.3.0: ok x5
$ k6 run --summary-export ... k6/smoke/medusa-health.js     (Medusa up through npm run up:medusa)
v1.8.2  exit=0 checks 5 passes 0 fails; http_req_failed 0 of 5
v2.3.0  exit=0 checks 5 passes 0 fails; http_req_failed 0 of 5
v1.3.0  exit=0 checks 5 passes 0 fails; http_req_failed 0 of 5
$ k6 run ... k6/smoke/cal-health.js          v1.8.2 exit=0     v2.3.0 exit=0       (Cal up)
```

The Documenso and Twenty smokes on 2.3.0: build-time probe must confirm (Task 7 probes Documenso with 2.3.0; the Twenty smoke stays, Phase 5).
`@types/k6` in the repo is already `2.3.0` (`node_modules/@types/k6/package.json`), so `npm run typecheck` already speaks the pinned API.

**`grafana/setup-k6-action` v1.2.2 cannot be the shared installer.** Its source (cloned at tag `v1.2.2`, `src/k6.ts`) downloads
`https://github.com/grafana/k6/releases/download/v${version}/k6-v${version}-${os}-${arch}.tar.gz` and extracts it. There is **no
checksum or signature check anywhere in it**. It would install 2.3.0 (the URL pattern is valid) but it does not verify (roadmap probe item 3: answered). It also does not run on Cursor or the
Claude Code cloud. So the shared, verified script of the roadmap is needed, and CI uses it too.

**Both download hosts are reachable under this session's network policy:**

```text
$ curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://github.com/grafana/k6/releases/download/v2.3.0/k6-v2.3.0-checksums.txt
302 https://release-assets.githubusercontent.com/github-production-release-asset/…          # then 200
$ curl -sSI https://dl.k6.io/deb/dists/stable/InRelease | head -1        HTTP/1.1 200
$ curl -sS -o /dev/null -w '%{http_code}' https://github.com/grafana/k6/releases/latest              403   # blocked: do not use "latest"
$ curl -sS https://api.github.com/repos/grafana/k6/releases                                        {"message":"GitHub access to this repository is not enabled for this session..."}   # blocked: do not use the API
```

The installer therefore uses **only** the fixed release-asset URL of a pinned version, never `latest`, never the API.
Whether the maintainer's own cloud environments allow `github.com` and `release-assets.githubusercontent.com` is not
visible from inside a session: build-time probe must confirm (§11).

### 3.3 The installer, prototyped and run (roadmap probe item 2)

A prototype of `scripts/install-k6.sh` (§6.1) with the pin in `.k6-version` and the expected hashes in `scripts/k6-sha256.txt`
(copied from the release's own `k6-v2.3.0-checksums.txt`; the downloaded tarball matched):

```text
$ curl -sSL .../k6-v2.3.0-checksums.txt | grep linux-amd64.tar.gz     39c3117b6af817592dcd0ce4242105c0a7af10948c2a425306f0be8f7a8a8ab1  k6-v2.3.0-linux-amd64.tar.gz
$ grep linux-arm64.tar.gz                                             5ca3433e8201da72a284aaa241a1bb5fb47f4abb4e384d39410ddd8062f49b90  k6-v2.3.0-linux-arm64.tar.gz
$ sha256sum -c  k6.tgz                                                k6.tgz: OK
== first install   (K6_INSTALL_DIR=/tmp/…/bin)      k6 v2.3.0 (commit/e088784614, go1.26.8, linux/amd64)     real 2.59 s
== second install (idempotent)                       k6 2.3.0 already installed at /tmp/…/bin/k6
== wrong hash   (first 4 hex digits changed)         sha256sum: WARNING: 1 computed checksum did NOT match / sha256 mismatch for k6-v2.3.0-linux-amd64.tar.gz     exit=1
== missing pin  (.k6-version = 9.9.9)                no pinned sha256 for k6-v9.9.9-linux-amd64.tar.gz in k6-sha256.txt     exit=1
$ shellcheck install-k6.sh                                            shellcheck-ok
```

The hash is **committed in the repo**, not fetched with the tarball: a checksum file served next to the file it protects shows
corruption, not tampering. The tarball layout is `k6-v2.3.0-linux-amd64/k6` (one directory, one binary).

### 3.4 The workload facts the library rests on (stub probe, k6 2.3.0 and 1.3.0 behave the same)

The stub (`/tmp/s/probe/co/stub.mjs`): a Node HTTP server, fixed service time 25 ms, and a stall: during the first 1500 ms of every
10 s window a request is held until the stall ends. Scripts: `co.js` (open model `constant-arrival-rate`, or closed model
`constant-vus` with 75 ms think time so that 4 VUs ≈ 40 requests per second nominally). Rate 40 per second, 30 s.

| Run                                 | Requests completed | `dropped_iterations` | `vus_max` | p95 (ms) | median | max (ms) | k6                                |
| ----------------------------------- | ------------------ | -------------------- | --------- | -------- | ------ | -------- | --------------------------------- |
| open, 20 pre-allocated, 200 max     | 1169               | 31                   | 51        | 1046     | 26     | 1523     | 2.3.0 (1.3.0: 1165, 36, 56, 1043) |
| open, **80 pre-allocated**, 100 max | **1201**           | **absent (0)**       | 80        | 1020     | 26     | –        | 2.3.0                             |
| open, **5 pre-allocated**, 5 max    | 1031               | **170**              | 5         | **26**   | 26     | –        | 2.3.0                             |
| open, 20 pre-allocated, 20 max      | 1077               | 123                  | 20        | 1070     | 26     | –        | 2.3.0                             |
| closed, 4 VUs                       | **1008**           | absent               | 4         | **26**   | 26     | 1486     | 2.3.0 (1.3.0: 1008, 26, 1490)     |

Reading it (these are the **relations** the self-test asserts, not the numbers):

1. **Open model keeps the plan.** 40 per second × 30 s = 1200 arrivals; sized open run completes 1201 and drops none. Closed sends
   1008, 16 % fewer, because its VUs sat in the stalls.
2. **Closed hides the stall.** p95 26 ms (closed) against 1020 to 1046 ms (open): a factor of about 40. The max (1.5 s) is the same, only
   the count of slow requests differs (4 per stall against 60).
3. **Under-sized open hides it too, and says so.** 5 VUs: p95 26 ms like closed, but `dropped_iterations` is 170 of 1200. A run with drops is not a measurement
   (this is the signal `P6-X-LOAD-004` turns into INVALID in Task 4).
4. **k6 allocates VUs lazily.** With 20 pre-allocated of 200 allowed, 31 iterations were still dropped while k6 grew the pool during
   the stall. So the library sizes `preAllocatedVUs` by Little's law with headroom: `ceil(rate × maxLatency × 1.25)` = `ceil(40 × 1.6 × 1.25)` = **80**,
   which dropped none.
5. **`dropped_iterations` is absent from the summary when it is 0**: the parser must read a missing metric as 0.
6. **Summary format** (`--summary-export`): `metrics.<name>` with `avg`, `min`, `med`, `max`, `p(90)`, `p(95)`, `p(99)` (from
   `summaryTrendStats`), counters with `count`/`rate`, `vus_max` as `{min,max,value}` (or `{max,value}`), `checks` as
   `{passes,fails,value,thresholds}`; identical on 1.3.0 and 2.3.0 (`http_req_duration` keys the same). A crossed threshold is
   `thresholds: {"rate==1": true}` with exit code **99**; not crossed is `false`, exit 0 (checked live).

JSON output (`--out json=…`): one line per sample, `{"type":"Point","metric":"http_reqs","data":{"time":"2026-10-24T00:47:13.382153795Z","value":1,"tags":{…,"url":"http://127.0.0.1:18080/work",…}}}`: ISO times with nanoseconds (Task 5 aligns on them), **and a `url` tag with the full URL**. 30 s at 40 per second wrote 3.95 MB (16,457 points). For
Documenso a URL carries `/sign/<token>`: the library therefore drops the `url` system tag and names every request (§6.3).
The `.json.gz` extension makes k6 gzip the file (build-time probe must confirm the saving on a real run).

k6 CPU, measured by sampling `/proc/<k6 pid>/stat` (fields 14 and 15, `CLK_TCK` 100) every second, stub on the same box:

| Rate (requests/s) | k6 CPU (cores, per second samples) | `dropped_iterations` | p95 (ms) |
| ----------------- | ---------------------------------- | -------------------- | -------- |
| 100               | 0.07 to 0.09                       | 0                    | 26       |
| 1000              | 0.34 to 0.37                       | 0                    | 26       |
| 4000              | 0.71 to 0.79                       | 0                    | 26       |
| 9000              | 1.25 to 1.41                       | 299 (first drops)    | 31       |

(For Task 4: the generator is never the bottleneck at the functional rates of this phase, tens of requests per second.)

k6 `2.3.0` also runs a `.ts` script and a relative `.ts` import natively (probe: `export function vusFor…` in `pure.ts`, imported by `t.ts`,
printed `vusFor 62`). That is the proper alternative to the JS library below; see Q2.

Inputs: `JSON.parse(open(__ENV.P6_LOAD_CONFIG))` read a JSON file and `__ENV.P6_TOKEN` a secret from the environment, with plain `k6 run`
(probe `j.js`): the standalone mechanism of D6 works as designed.

### 3.5 What this decided

- Pin **2.3.0**, installed by a checksum-verified script, hash committed (§6.1). CI replaces `grafana/setup-k6-action` in five jobs; `twenty-smoke` keeps the action, pinned to `.k6-version` through its `k6-version` input (Phase 5 owns Twenty's verification).
- Library sizes VUs by Little's law (fact 4), reads missing `dropped_iterations` as 0 (fact 5), drops the `url` tag (JSON output).
- Stub parameters: service 25 ms, stall 1500 ms every 10 000 ms, rate 40 per second, 30 s per run, three runs (open sized, closed,
  open under-sized). Margins in §7, each at least 3 times looser than the probe.
- The runner core is built **in this task** (it is needed to orchestrate the three runs and judge them); Task 4 adds the validity step
  on top (roadmap says Task 4 builds the skeleton; see "Contradictions", C1).

### 3.6 What stays unconfirmed ("build-time probe must confirm")

1. The maintainer's environments' network policies for `github.com` and `release-assets.githubusercontent.com` (§11).
2. The CI self-test margins at 30 s on a shared runner (three CI runs before merge, §9).
3. The Documenso and Twenty smokes on 2.3.0 (Task 7 and Phase 5 probes).
4. `.json.gz` output size on a real journey.
5. That `setup-node`, `npm ci` and the new install step stay within the 20-minute job timeout of §9 (measured setup is 16 s).

## 4. Depends on earlier plans

Nothing from Tasks 1, 2, 4 to 10. From `main`: `p6RunPrefix` and `isP6RunPrefix` (`src/races/prefix.ts`), `scripts/evidence-token-scan.mjs`
(`findHits`, `scanTree`), the `tests/unit/*.test.ts` + `node --test` pattern (`package.json` `test:unit`), `tsconfig.json` (`checkJs` on `k6/**/*.js`),
`tsconfig.races.json`, `scripts/k6-inspect.mjs`, `.claude/hooks/session-start.sh`, `.cursor/Dockerfile`, `.cursor/environment.json`.

## 5. Build-time recheck

| #   | Check                           | Command                                                                                                                                             | Expected                                                                                           |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | Base                            | `git fetch origin main && git log -1 --format=%h origin/main`                                                                                       | `5acd2a0` or a descendant containing `a82521a`                                                     |
| 2   | Newest k6                       | the loop of §3.2 for the next versions (`2.3.1 2.4.0 2.5.0 3.0.0`)                                                                                  | all `404`: the pin stays 2.3.0. A `302` means a newer release exists: re-read its notes and Q1     |
| 3   | Pinned hashes still true        | `curl -sSL https://github.com/grafana/k6/releases/download/v2.3.0/k6-v2.3.0-checksums.txt \| grep -E "linux-(amd64\|arm64).tar.gz"`                 | the two lines of §3.3                                                                              |
| 4   | Baseline                        | `export PATH="/usr/local/bin:$PATH"; npm run check`                                                                                                 | exit 0, `# tests` = B (503 once Tasks 1 and 2 are merged)                                          |
| 5   | setup-k6 sites and `K6_VERSION` | `grep -n "setup-k6-action\|K6_VERSION" .github/workflows/perf.yml`                                                                                  | 6 `uses:` lines, 6 `k6-version:` lines, 1 definition (line numbers may have moved)                 |
| 5b  | The action's version input name | `git clone --depth 1 --branch v1.2.2 https://github.com/grafana/setup-k6-action /tmp/s/setup-k6 && grep -n "k6-version" /tmp/s/setup-k6/action.yml` | an input named `k6-version` (the one the six jobs use today); if renamed, use the new name in §6.8 |
| 6   | Node runs `.ts`                 | `node -e 'console.log(process.version)'`; `node scripts/write-ci-job-summary.ts` (prints the summary)                                               | ≥ v22.22                                                                                           |
| 7   | Which smokes exist              | `ls k6/smoke`                                                                                                                                       | `cal-health.js documenso-health.js medusa-health.js twenty-health.js`                              |
| 8   | Hook and Dockerfile unchanged   | `grep -n "k6" .cursor/Dockerfile .claude/hooks/session-start.sh .cursor/environment.json`                                                           | Dockerfile has the apt k6 block; hook and environment.json have none                               |

## 6. Design

### 6.1 File tree

```text
.k6-version                                  NEW      "2.3.0"
scripts/install-k6.sh                        NEW      pinned, checksum-verified installer (CI, Cursor install step, Claude hook)
scripts/k6-sha256.txt                        NEW      expected sha256 per tarball of the pinned version
scripts/lib/k6-pin.mjs                       NEW      pure: compareK6Version(stdout, pin)
scripts/k6-inspect.mjs                       CHANGED  fail (not skip) on a version mismatch when k6 is present
scripts/load/run-load.ts                     NEW      CLI entry of the LOAD runner
src/load/types.ts                            NEW      shared types (§6.2)
src/load/paths.ts                            NEW      run directory layout
src/load/env.ts                              NEW      repo .env + PRODUCTS_ROOT bootstrap shared with scripts/harness.mjs conventions
src/load/summary.ts                          NEW      parse k6 --summary-export
src/load/k6-process.ts                       NEW      run one k6 process
src/load/stages.ts                           NEW      default stage set, stage runner
src/load/runner.ts                           NEW      runLoad(): the pipeline
src/load/cases.ts                            NEW      case registry (P6-X-LOAD-001 only in this task)
src/load/co-relations.ts                     NEW      the coordinated-omission relations and their margins
src/load/stub-server.ts                      NEW      the stub (service time + periodic stall)
k6/lib/pure/sizing.js options.js prefix.js journey.js config.js     NEW   no k6 import, unit-tested in Node
k6/lib/config.js http.js                     NEW      k6 glue (imports k6/*)
k6/selftest/coordinated-omission.js          NEW      the self-test script (open, closed, under-sized by env)
k6/selftest/config.example.json              NEW      input for the standalone command
tests/unit/k6-lib-*.test.ts, load-*.test.ts, stub-server.test.ts, k6-pin.test.ts    NEW
tsconfig.races.json                          CHANGED  allowJs/checkJs for k6/lib/pure, include scripts/load/*.ts
package.json                                 CHANGED  scripts: load:selftest, k6:install
.github/workflows/perf.yml                   CHANGED  five installs by script, twenty-smoke action pinned to .k6-version, K6_VERSION definition removed, new job load-selftest
.cursor/Dockerfile                           CHANGED  apt k6 block removed
.cursor/environment.json                     CHANGED  install runs scripts/install-k6.sh
.claude/hooks/session-start.sh               CHANGED  installs the pinned k6 when it differs
AGENTS.md                                    CHANGED  one line: pinned version and where it is installed
README.md                                    CHANGED  "How to read a LOAD run"; standalone commands
```

**Non-standard choices, flagged with the proper alternative.**
(a) `k6/lib` is JavaScript. The alternative is TypeScript (k6 2.3.0 runs it natively, §3.4) with one typed pure module shared by Node and k6, removing
the `allowJs` setting; the roadmap and D11 say `k6/lib/*.js` and the repo already type-checks `k6/**/*.js` with `checkJs`, so JS stays (Q2).
(b) `.k6-version` is a bespoke file; the alternative is `.tool-versions` (asdf/mise). One value, one reader (`install-k6.sh`), so the plain file stays.
(c) Pure modules live in `k6/lib/pure/` and k6-importing ones in `k6/lib/`: the split is what lets `node --test` import the pure ones
without a `k6/*` module. Standard in k6 projects that unit-test helpers.

### 6.2 Types and the stage pipeline (the contract Tasks 4 to 10 plug into)

`src/load/types.ts` (NEW, exact):

```ts
export type LoadProduct = "stub" | "medusa" | "cal" | "documenso";
export type LoadProfileName = "pr" | "full";

/** One workload size. `rate` is iterations per second (timeUnit 1s). Sizes come from the case's probe (D1). */
export interface LoadProfile {
  rate: number;
  durationSec: number;
  /** Slowest single iteration expected, in ms: input of the Little's-law sizing (k6/lib/pure/sizing.js). */
  maxLatencyMs: number;
}

/** One k6 process of a case. Most cases have exactly one; the self-test has three. */
export interface K6RunSpec {
  label: string; // "main", "open", "closed", "undersized"
  script: string; // repo-relative, e.g. "k6/selftest/coordinated-omission.js"
  env: Record<string, string>; // non-secret inputs; also written to k6-config.json
  secretEnv?: string[]; // NAMES of env vars to forward from the runner's environment; values never logged or written
  expectExit?: number; // default 0 (99 = thresholds crossed)
}

export interface LoadCase {
  id: string; // "P6-X-LOAD-001"
  title: string;
  product: LoadProduct;
  label: "functional load, not capacity"; // D1, P6-RULE-003: printed in verdict.json and the job summary
  profiles: Record<LoadProfileName, LoadProfile>;
  runs: (ctx: LoadContext) => K6RunSpec[]; // evaluated after setup, so ids made in setup can go into env
  /** Per-case overrides of the default stages (setup, reconcile, ...). Tasks 7 to 10 use this. */
  stages?: Partial<StageSet>;
}

export type StageName =
  | "setup"
  | "preflight"
  | "samplerStart"
  | "k6"
  | "samplerStop"
  | "drain"
  | "reconcile"
  | "cleanup"
  | "tokenScan"
  | "verdict";

/** Failure kinds, in the vocabulary of docs/agent-rules.md. INVALID is not a failure (Task 4). */
export type FindingKind = "ENV" | "TEST BUG" | "PRODUCT BUG" | "INVALID";

export interface StageResult {
  ok: boolean;
  /** Present when ok is false, or for INVALID reasons that do not stop the pipeline. */
  kind?: FindingKind;
  reasons: string[]; // one line each; no secrets, ids and counts only
  data?: Record<string, unknown>; // stage output, merged into verdict.json under stages.<name>
  ms?: number;
}

export interface K6RunResult {
  label: string;
  exitCode: number;
  summaryPath: string; // <outDir>/k6-<label>-summary.json
  pointsPath: string; // <outDir>/k6-<label>.json.gz
  stdoutPath: string; // <outDir>/k6-<label>.log
  startedAtMs: number;
  endedAtMs: number;
  pid: number; // for the sampler (Task 5) and the CPU guard (Task 4)
}

export interface LoadContext {
  caseDef: LoadCase;
  profileName: LoadProfileName;
  profile: LoadProfile;
  runId: string; // "<UTC compact>-<8 hex>", e.g. "20261024T010203Z-3fa9c0d1"
  runPrefix: string; // p6RunPrefix(); isP6RunPrefix(runPrefix) is true
  outDir: string; // results/load/<caseId>/<runId>
  env: NodeJS.ProcessEnv; // the runner's environment (read-only)
  /** Free-form values set by setup and read by later stages (ids, base URLs). Never secrets. */
  config: Record<string, unknown>;
  k6: K6RunResult[]; // filled by the "k6" stage
  invalid: string[]; // INVALID reasons added by Task 4 and Task 5 stages
  results: Partial<Record<StageName, StageResult>>;
}

export type Stage = (ctx: LoadContext) => Promise<StageResult>;
export type StageSet = Record<StageName, Stage>;

export type Outcome = "PASS" | "FAIL" | "INVALID" | "ENV";
```

**Stage order and meaning** (fixed; `runLoad` in `src/load/runner.ts` runs exactly this order):

| Stage          | Owner       | Task 3 does                                                          | Plugged in by                                              |
| -------------- | ----------- | -------------------------------------------------------------------- | ---------------------------------------------------------- |
| `setup`        | case        | stub: start the stub server in-process                               | each case (T7 to T10: ids, tokens, stock)                  |
| `preflight`    | runner      | no-op placeholder (always ok)                                        | Task 4: readiness (health URL, race leak check, D10)       |
| `samplerStart` | runner      | no-op placeholder                                                    | Task 5: outside-only sampler                               |
| `k6`           | runner      | spawn every `K6RunSpec`, wait, record exits                          | —                                                          |
| `samplerStop`  | runner      | no-op placeholder                                                    | Task 5                                                     |
| `drain`        | case        | no-op placeholder                                                    | Task 9 (pending seal jobs), Task 8/10 as needed            |
| `reconcile`    | runner/case | no-op placeholder                                                    | Task 6 (`src/load/reconcile/*`), Task 4's validity verdict |
| `cleanup`      | case        | stub: stop the stub server                                           | each case (sweep by `runPrefix`, leak check)               |
| `tokenScan`    | runner      | scan `outDir` with `scanTree` from `scripts/evidence-token-scan.mjs` | —                                                          |
| `verdict`      | runner      | combine into `verdict.json`; exit code                               | Task 4 refines validity; Task 3's `evaluateVerdict` stays  |

Rules the pipeline enforces (so later tasks cannot get them wrong):

1. A stage that returns `ok: false` with kind `ENV` or `TEST BUG` in `setup` or `preflight` stops the run before `k6`; `cleanup`, `tokenScan` and
   `verdict` still run. The outcome is `ENV` (never a LOAD result).
2. `k6`, `reconcile` and later stages always run after a started `k6`; `cleanup` runs even if an earlier stage threw (the runner catches
   the throw, records it as `TEST BUG` with the message, and continues).
3. `ctx.invalid` collects INVALID reasons (Tasks 4 and 5 append). They never turn a correctness failure into anything else.
4. Secrets: only `secretEnv` names pass to k6; values are read from `ctx.env` at spawn time and are never put in `ctx.config`,
   `k6-config.json`, `verdict.json` or a log line.

**Outcome** (`evaluateVerdict`, pure, in `src/load/runner.ts`): `ENV` if setup/preflight failed. Else `FAIL` if any stage result of kind
`PRODUCT BUG` or `TEST BUG`, or any `K6RunResult.exitCode` differs from its `expectExit`, or the token scan found a hit. Else `INVALID` if
`ctx.invalid.length > 0`. Else `PASS`. (A correctness failure is `FAIL` even on an INVALID run: INVALID never hides a failure, mirroring Phase 2 D3.)

### 6.3 `k6/lib` (the workload library)

Pure modules (`k6/lib/pure/*.js`, ES modules, **no `k6/*` import**, exact exports):

```js
// sizing.js
/** Little's law with headroom: VUs a constant-arrival-rate scenario must pre-allocate so k6 never grows the pool mid-run (§3.4 fact 4). */
export function preAllocatedVUs({ rate, timeUnitSec = 1, maxLatencyMs, safety = 1.25, min = 1 }) {
  assertPositive("rate", rate);
  assertPositive("maxLatencyMs", maxLatencyMs);
  return Math.max(min, Math.ceil((rate / timeUnitSec) * (maxLatencyMs / 1000) * safety));
}
export function maxVUs(preAllocated, headroom = 1.5) {
  return Math.ceil(preAllocated * headroom);
}
export function plannedIterations(rate, durationSec, timeUnitSec = 1) {
  return Math.round((rate / timeUnitSec) * durationSec);
}
function assertPositive(name, v) {
  if (!Number.isFinite(v) || v <= 0) throw new Error(`${name} must be a positive number, got ${v}`);
}
```

```js
// options.js
export const SUMMARY_TREND_STATS = ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"];
/** k6 default system tags minus "url": a URL can carry a token or an id (§3.4). Every request is named with tags.name instead. */
export const SYSTEM_TAGS = [
  "status",
  "method",
  "name",
  "scenario",
  "error",
  "error_code",
  "check",
  "expected_response",
];

export function openModelScenario({
  rate,
  durationSec,
  maxLatencyMs,
  exec,
  startTimeSec,
  tags,
  preAllocated,
  maxVus,
}) {
  const pre = preAllocated ?? preAllocatedVUs({ rate, maxLatencyMs });
  return {
    executor: "constant-arrival-rate",
    rate,
    timeUnit: "1s",
    duration: `${durationSec}s`,
    preAllocatedVUs: pre,
    maxVUs: maxVus ?? maxVUs(pre),
    ...(exec ? { exec } : {}),
    ...(startTimeSec ? { startTime: `${startTimeSec}s` } : {}),
    ...(tags ? { tags } : {}),
  };
}
export function rampingOpenScenario({ startRate, stages, maxLatencyMs, exec, tags }) {
  // Phase 4 uses it; unit-tested now
  const peak = Math.max(startRate, ...stages.map((s) => s.target));
  const pre = preAllocatedVUs({ rate: peak, maxLatencyMs });
  return {
    executor: "ramping-arrival-rate",
    startRate,
    timeUnit: "1s",
    preAllocatedVUs: pre,
    maxVUs: maxVUs(pre),
    stages: stages.map((s) => ({ target: s.target, duration: `${s.durationSec}s` })),
    ...(exec ? { exec } : {}),
    ...(tags ? { tags } : {}),
  };
}
/** Closed model. Only the coordinated-omission self-test uses it (the comparison needs a closed run). */
export function closedModelScenario({ vus, durationSec, exec, tags }) {
  return {
    executor: "constant-vus",
    vus,
    duration: `${durationSec}s`,
    ...(exec ? { exec } : {}),
    ...(tags ? { tags } : {}),
  };
}
const LATENCY_THRESHOLD =
  /^(http_req_(duration|waiting|connecting|blocked|sending|receiving|tls_handshaking)|iteration_duration|http_reqs|data_(sent|received))(\{|$)/;
/** D9: only correctness thresholds (checks, http_req_failed and custom counters). Throws on a latency or throughput threshold. */
export function assertCorrectnessThresholds(thresholds) {
  for (const key of Object.keys(thresholds)) {
    if (LATENCY_THRESHOLD.test(key))
      throw new Error(
        `threshold on "${key}" is a latency/throughput gate; none are allowed in Phase 3 (D9, P6-RULE-001)`,
      );
  }
  return thresholds;
}
export function standardOptions({ scenarios, thresholds = {}, tags = {} }) {
  return {
    scenarios,
    thresholds: assertCorrectnessThresholds(thresholds),
    summaryTrendStats: SUMMARY_TREND_STATS,
    systemTags: SYSTEM_TAGS,
    tags,
    discardResponseBodies: false,
  };
}
```

(`options.js` imports `preAllocatedVUs`, `maxVUs` from `./sizing.js`; a function parameter named `maxVus` avoids shadowing `maxVUs`.)

```js
// prefix.js  (the runner passes the run prefix in; the library never makes one)
export const RUN_PREFIX_RE = /^p6-qa-\d{8}T\d{6}Z-[0-9a-f]{8}$/; // same as src/races/prefix.ts
export function assertRunPrefix(prefix) {
  if (!RUN_PREFIX_RE.test(prefix)) throw new Error(`not a P6 run prefix: ${prefix}`);
  return prefix;
}
/** Case-scoped, lower-case, [a-z0-9-] only (the leak-check LIKE literal rule of src/medusa/payloads.ts casePrefix). */
export function caseDataPrefix(runPrefix, caseId) {
  const p = `${assertRunPrefix(runPrefix)}-${caseId}`.toLowerCase();
  if (!/^[a-z0-9-]+$/.test(p)) throw new Error(`case prefix "${p}" is not [a-z0-9-]`);
  return p;
}
/** One id per iteration and VU-independent: the scenario's global iteration counter makes it unique across VUs. */
export function iterationId(dataPrefix, iterationInTest) {
  return `${dataPrefix}-i${iterationInTest}`;
}
export function attendeeEmail(dataPrefix, leaf, domain = "example.com") {
  return `${dataPrefix}-${leaf}@${domain}`;
}
```

```js
// journey.js  (composable steps, all k6 calls injected so Node tests can drive it)
/**
 * steps: [{ name, run(state) -> { ok: boolean, data?: object }, thinkSec?: number }]
 * deps:  { check(name, ok), sleep(sec), now() -> ms }
 * A failed step ends the journey (later steps need its output). Returns the per-step record the audit joins on.
 */
export function runJourney({ steps, state = {}, deps }) {
  const record = [];
  for (const step of steps) {
    const t0 = deps.now();
    const result = step.run(state);
    deps.check(`${step.name}`, result.ok);
    record.push({ name: step.name, ok: result.ok, ms: deps.now() - t0 });
    if (!result.ok) return { completed: false, failedStep: step.name, steps: record, state };
    if (result.data) Object.assign(state, result.data);
    if (step.thinkSec) deps.sleep(step.thinkSec);
  }
  return { completed: true, failedStep: null, steps: record, state };
}
```

```js
// config.js (pure part)  input = JSON text of P6_LOAD_CONFIG (or "") + env
/** Config the runner wrote (k6-config.json) merged over defaults from the environment. Throws on a missing required key. */
export function parseLoadConfig(text, env, required = []) {
  const fromFile = text ? JSON.parse(text) : {};
  const cfg = { ...fromFile };
  for (const key of required)
    if (cfg[key] === undefined && env[key] === undefined)
      throw new Error(`missing load config key ${key}`);
  return cfg;
}
```

k6-importing modules (`k6/lib/*.js`, covered by `k6 inspect`, `tsc` checkJs and the self-test, not by unit tests):

```js
// config.js (k6 glue)
import { parseLoadConfig } from "./pure/config.js";
/** Reads P6_LOAD_CONFIG (a JSON file path, written by the runner or by hand for a standalone run). Must be called in the init context. */
export function loadLoadConfig(required = []) {
  const path = __ENV.P6_LOAD_CONFIG;
  return parseLoadConfig(path ? open(path) : "", __ENV, required);
}
```

```js
// http.js (k6 glue)
import http from "k6/http";
import { check } from "k6";
/** GET/POST with a fixed `name` tag (so no URL with an id or token becomes a metric label) and an explicit timeout. */
export function request(method, url, name, body, params = {}) {
  const p = { ...params, tags: { ...(params.tags || {}), name } };
  return method === "GET"
    ? http.get(url, p)
    : http.post(url, body === undefined ? null : JSON.stringify(body), p);
}
/** Declares which statuses are expected so http_req_failed stays meaningful (a clean 400 refusal is not a failure; D9). */
export function expectStatuses(...extra) {
  http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, ...extra));
}
export const checks = check;
```

The self-test script (`k6/selftest/coordinated-omission.js`): reads `P6_LOAD_CONFIG` (JSON) with `MODEL` (`open` or `closed`), `RATE`, `DURATION_SEC`,
`MAX_LATENCY_MS`, `PRE`, `MAXVUS`, `PORT` (env wins over the file when both are set), builds the scenario with `openModelScenario` /
`closedModelScenario` and `standardOptions({ thresholds: { checks: ["rate==1"] } })`, and its default function does one `request("GET", .../work, "GET /work")`
plus `check(200)`; closed model adds `sleep(0.075)`. Its header comment holds the standalone commands (§6.9).

### 6.4 Runner core (`src/load/*`, `scripts/load/run-load.ts`)

```ts
// src/load/paths.ts
export const LOAD_ROOT = "results/load";
export function runDir(caseId: string, runId: string): string {
  return `${LOAD_ROOT}/${caseId}/${runId}`;
}
export function newRunId(now = new Date()): string {
  /* "20261024T010203Z-" + 8 hex (crypto.randomBytes(4)) */
}
```

```ts
// src/load/env.ts   mirrors scripts/harness.mjs: loadEnvFile(".env") if present, PRODUCTS_ROOT default "../products" next to the repo,
// MEDUSA_SKIP_STOREFRONT=1. Called once by run-load.ts before any stage. Existing environment values win over .env.
export function loadRepoEnv(root = process.cwd(), env = process.env): void;
```

```ts
// src/load/summary.ts
export interface K6Summary {
  requests: number;
  failedRate: number;
  iterations: number;
  dropped: number;
  vusMax: number;
  p95Ms: number;
  medMs: number;
  maxMs: number;
  checksPassed: number;
  checksFailed: number;
  thresholdsCrossed: string[];
}
/** Missing dropped_iterations is 0 (§3.4 fact 5); thresholds map value true means crossed (checked live: exit 99). */
export function parseK6Summary(json: unknown): K6Summary;
```

```ts
// src/load/k6-process.ts
export interface RunK6Input {
  binary?: string;
  spec: K6RunSpec;
  outDir: string;
  config: Record<string, unknown>;
  env: NodeJS.ProcessEnv;
}
/** Writes <outDir>/k6-config.json (non-secret), spawns `k6 run --summary-export <summary> --out json=<points.gz> <script>` with
 *  env = { ...spec.env, P6_LOAD_CONFIG: <config path>, ...only the secretEnv names from env }, waits, returns K6RunResult. Never passes a secret on argv. */
export async function runK6(input: RunK6Input): Promise<K6RunResult>;
```

```ts
// src/load/stages.ts
export const defaultStages: StageSet = {
  setup: ok,
  preflight: ok,
  samplerStart: ok,
  k6: runAllK6,
  samplerStop: ok,
  drain: ok,
  reconcile: ok,
  cleanup: ok,
  tokenScan: scanOutDir,
  verdict: writeVerdict,
};
// ok = async () => ({ ok: true, reasons: [] }). runAllK6 loops caseDef.runs(ctx) sequentially (one k6 at a time: no two generators on a shared runner).
```

```ts
// src/load/runner.ts
export interface RunOptions {
  profile: LoadProfileName;
  outRoot?: string;
  runId?: string;
  stages?: Partial<StageSet>;
  env?: NodeJS.ProcessEnv;
}
export interface LoadResult {
  outcome: Outcome;
  ctx: LoadContext;
  verdictPath: string;
  exitCode: 0 | 1 | 2 | 3;
}
export async function runLoad(caseDef: LoadCase, opts: RunOptions): Promise<LoadResult>;
export function evaluateVerdict(ctx: LoadContext): { outcome: Outcome; reasons: string[] }; // pure, unit-tested
export const EXIT_CODES = { PASS: 0, FAIL: 1, ENV: 2, INVALID: 3 } as const;
```

CLI (`scripts/load/run-load.ts`): `node scripts/load/run-load.ts --case P6-X-LOAD-001 [--profile pr|full] [--out results/load]`; unknown case or profile
exits 2 with the list of ids. `package.json`: `"load:selftest": "node scripts/load/run-load.ts --case P6-X-LOAD-001"`, `"k6:install": "bash scripts/install-k6.sh"`.

**`verdict.json` (schema 1)**, written to `<outDir>/verdict.json`:

```json
{
  "schema": 1,
  "caseId": "P6-X-LOAD-001",
  "runId": "20261024T010203Z-3fa9c0d1",
  "profile": "full",
  "label": "functional load, not capacity",
  "startedAt": "2026-10-24T01:02:03.000Z",
  "finishedAt": "2026-10-24T01:04:05.000Z",
  "outcome": "PASS",
  "reasons": [],
  "invalid": [],
  "k6": [
    { "label": "open", "exitCode": 0, "requests": 1201, "dropped": 0, "vusMax": 80, "p95Ms": 1020 }
  ],
  "stages": { "setup": { "ok": true, "ms": 31 }, "k6": { "ok": true, "ms": 91234 } }
}
```

No URL, token, header or body appears anywhere in it (counts, ids and fixed phrases only).

### 6.5 The coordinated-omission relations (`src/load/co-relations.ts`)

```ts
export interface CoRun {
  requests: number;
  dropped: number;
  p95Ms: number;
}
export interface CoInput {
  open: CoRun;
  closed: CoRun;
  undersized: CoRun;
  rate: number;
  durationSec: number;
  serviceMs: number;
}
export const CO_MARGINS = {
  openKeepsRate: 0.97, // open.requests + open.dropped >= 0.97 x planned; probe: 1201 / 1200
  openDropsAtMost: 0.05, // sized open: dropped <= 5 % of planned; probe: 0
  closedSendsFewer: 0.95, // closed.requests <= 0.95 x open.requests; probe: 0.84
  closedP95Factor: 3, // closed.p95 x 3 <= open.p95; probe: 26 x 40
  openShowsStallFactor: 5, // open.p95 >= 5 x serviceMs; probe: 1020 >= 125
  undersizedDropsAtLeast: 0.05, // undersized.dropped >= 5 % of planned; probe: 170 of 1200 = 14 %
} as const;
/** Returns one violation line per broken relation. Empty = the self-test shows coordinated omission the way the roadmap asks. */
export function evaluateCoordinatedOmission(input: CoInput, margins = CO_MARGINS): string[];
```

The relations compare **ratios on the same stub in the same job**, never absolute milliseconds, so a slow runner scales both sides.

### 6.6 The stub (`src/load/stub-server.ts`)

```ts
export interface StubOptions {
  port: number;
  serviceMs: number;
  stallMs: number;
  periodMs: number;
  now?: () => number;
}
/** Pure: how long a request that arrives `elapsedMs` after the stub started waits. During the first stallMs of each period
 *  it waits until the stall ends, plus serviceMs. */
export function stubDelayMs(
  elapsedMs: number,
  o: Pick<StubOptions, "serviceMs" | "stallMs" | "periodMs">,
): number;
export function startStub(o: StubOptions): Promise<{ port: number; close(): Promise<void> }>; // 127.0.0.1 only; GET /work -> 200 {"ok":true}; port 0 = pick one
```

CLI use for a standalone run: `node src/load/stub-server.ts 18080 25 1500 10000` (port, serviceMs, stallMs, periodMs).

### 6.7 `scripts/install-k6.sh` (exact)

```bash
#!/usr/bin/env bash
# Installs the pinned k6 (.k6-version), verified against scripts/k6-sha256.txt. Idempotent. Used by CI, the Cursor install step
# and the Claude Code session hook, so the three cannot drift. Only fixed release-asset URLs; never "latest", never the API.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/.k6-version")"
DEST="${K6_INSTALL_DIR:-/usr/local/bin}"
case "$(uname -m)" in x86_64) arch=amd64 ;; aarch64 | arm64) arch=arm64 ;; *) echo "unsupported arch $(uname -m)" >&2; exit 1 ;; esac
have="$("$DEST/k6" version 2>/dev/null | sed -n 's/^k6 v\([0-9.]*\).*/\1/p' || true)"
if [ "$have" = "$VERSION" ]; then echo "k6 $VERSION already installed at $DEST/k6"; exit 0; fi
tar_name="k6-v${VERSION}-linux-${arch}.tar.gz"
expected="$(awk -v f="$tar_name" '$2==f {print $1}' "$ROOT/scripts/k6-sha256.txt")"
[ -n "$expected" ] || { echo "no pinned sha256 for $tar_name in scripts/k6-sha256.txt" >&2; exit 1; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
curl --retry 3 -fsSL -o "$tmp/$tar_name" "https://github.com/grafana/k6/releases/download/v${VERSION}/${tar_name}"
echo "${expected}  $tmp/$tar_name" | sha256sum -c - >/dev/null || { echo "sha256 mismatch for $tar_name" >&2; exit 1; }
tar -xzf "$tmp/$tar_name" -C "$tmp"
SUDO=""; if [ ! -w "$DEST" ] 2>/dev/null && [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi
$SUDO mkdir -p "$DEST"; $SUDO install -m 0755 "$tmp/k6-v${VERSION}-linux-${arch}/k6" "$DEST/k6"
"$DEST/k6" version
```

Differences from the probe prototype: the pin files are read from `scripts/`/repo root (script lives in `scripts/`), and `sudo` is used only when the
destination is not writable and the user is not root (the Cursor user `ubuntu` and the runner user have passwordless sudo; the Claude cloud is root).
`scripts/k6-sha256.txt` holds the two lines of §3.3. Bumping the pin = edit `.k6-version` and the two hashes (from the release's checksum file), nothing else.

`scripts/lib/k6-pin.mjs` and `scripts/k6-inspect.mjs`:

```js
// scripts/lib/k6-pin.mjs
/** @returns {{ ok: boolean, installed: string | undefined }} */
export function compareK6Version(versionStdout, pin) {
  const installed = /^k6 v(\d+\.\d+\.\d+)/.exec(versionStdout.trim())?.[1];
  return { ok: installed === pin, installed };
}
```

`k6-inspect.mjs` keeps "k6 not found → skip", and after `k6 version` succeeds it reads `.k6-version`, calls `compareK6Version`, and on a mismatch prints
`k6 v<installed> is installed, the repo pins v<pin>. Run: bash scripts/install-k6.sh` and exits 1 **before** inspecting any script.

### 6.8 CI (`perf.yml`)

Exact changes (details and budget in §9):

1. Delete the top-level `K6_VERSION: "1.8.2"` (line 31).
2. In `medusa-smoke`, `medusa-order-races`, `medusa-cancel-extras`, `cal-smoke`, `documenso-smoke` replace the `grafana/setup-k6-action` step by

```yaml
- name: Install k6 (pinned in .k6-version, checksum-verified)
  timeout-minutes: 2
  run: |
    set -euo pipefail
    bash "${{ github.workspace }}/p6/scripts/install-k6.sh"
```

(Measured install: 0.04 min, so the cap is 2.) 3. `twenty-smoke` keeps its existing `grafana/setup-k6-action` step and its existing 5-minute cap, unchanged except for the version it receives: the job's existing `Install P6 dependencies` step gets one more line, `echo "K6_VERSION=$(tr -d '[:space:]' < .k6-version)" >> "$GITHUB_ENV"` (run in `p6/`), and the action keeps `k6-version: ${{ env.K6_VERSION }}`, so the version comes from `.k6-version` and cannot drift. No step is added, so `twenty-smoke` stays at 9.2 min against 20 (§9). The action does not verify a checksum (§3.2); Twenty's verification is Phase 5's. Build-time recheck 5b confirms the input name. 4. New job `load-selftest`, product-free, on every event (pull request, push, schedule, dispatch):

```yaml
load-selftest:
  name: load-selftest
  runs-on: ubuntu-24.04
  timeout-minutes: 20
  steps:
    - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      with:
        persist-credentials: false
    - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0   (the exact line the other jobs use)
      with:
        node-version-file: .nvmrc
        cache: npm
    - name: Install P6 dependencies
      timeout-minutes: 3
      run: npm ci
    - name: Install k6 (pinned in .k6-version, checksum-verified)
      timeout-minutes: 2
      run: bash scripts/install-k6.sh
    - name: Coordinated-omission self-test (P6-X-LOAD-001)
      timeout-minutes: 3
      run: npm run load:selftest
    - name: Check artefacts for tokens
      if: ${{ !cancelled() }}
      timeout-minutes: 1
      run: node scripts/evidence-token-scan.mjs results/load
    - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
      if: ${{ !cancelled() }}
      with:
        name: load-selftest
        path: results/load/
        if-no-files-found: warn
        retention-days: 14
```

(The self-test step already scans its output through the `tokenScan` stage; the explicit step is the second, independent scan before upload,
the same pattern as the other jobs.) Job summary: the runner appends the `verdict.json` outcome and the three relation lines to `$GITHUB_STEP_SUMMARY`
(`src/load/runner.ts`, only when that variable is set).

### 6.9 Standalone commands (D6) and README text

Every k6 script runs with plain `k6 run`. Inputs come from the environment or a JSON file; secrets only from the environment.

```bash
# 1) the stub (any shell, Node 22.23+): port, service ms, stall ms, period ms
node src/load/stub-server.ts 18080 25 1500 10000 &
# 2) the open model, sized (80 VUs); 3) the closed model; 4) open but under-sized (drops iterations)
P6_LOAD_CONFIG=k6/selftest/config.example.json MODEL=open   k6 run k6/selftest/coordinated-omission.js
P6_LOAD_CONFIG=k6/selftest/config.example.json MODEL=closed k6 run k6/selftest/coordinated-omission.js
P6_LOAD_CONFIG=k6/selftest/config.example.json MODEL=open PRE=5 MAXVUS=5 k6 run k6/selftest/coordinated-omission.js
# or one scenario of a multi-scenario script (k6 2.3.0+): k6 run --scenario <name> script.js
```

`k6/selftest/config.example.json`: `{ "port": 18080, "rate": 40, "durationSec": 30, "maxLatencyMs": 1600, "serviceMs": 25 }`.
README ("How to read a LOAD run", new section, after "Run a race locally"): what a LOAD run is and the label "functional load, not capacity"; open vs closed in
five lines with the table of §3.4; what `dropped_iterations` means; where the files are (`results/load/<caseId>/<runId>/…`, §6.4); the standalone commands above;
"numbers from a cloud VM prove a test works and are never published".

## 7. Oracles and assertions

This task has no product oracle. Its correctness contract is the relations of §6.5, evaluated by the runner's `verdict` stage of the self-test case
(`P6-X-LOAD-001`) from the three `k6-*-summary.json` files:

| Relation                          | Check (all on the same stub, same job)                  | Probe value | Margin |
| --------------------------------- | ------------------------------------------------------- | ----------- | ------ |
| R1 open keeps the arrival rate    | `open.requests + open.dropped ≥ 0.97 × rate × duration` | 1201 / 1200 | 3 %    |
| R2 sized open does not drop       | `open.dropped ≤ 0.05 × planned`                         | 0           | 5 %    |
| R3 closed sends fewer requests    | `closed.requests ≤ 0.95 × open.requests`                | 0.84        | 11 pts |
| R4 closed reports a lower p95     | `3 × closed.p95 ≤ open.p95`                             | 1 : 40      | 13×    |
| R5 open shows the stall           | `open.p95 ≥ 5 × serviceMs`                              | 1020 ≥ 125  | 8×     |
| R6 under-sized open reports drops | `undersized.dropped ≥ 0.05 × planned`                   | 170 of 1200 | 3×     |

**PRODUCT BUG vs TEST BUG.** There is no product. A broken relation is a **TEST BUG** (stub, library or runner), reported with the three
summaries' numbers. The CI runner being too noisy is not a failure of the relation: the verdict is `INVALID` only after Task 4 exists
(until then a flipped relation fails the job and is root-caused; no assertion is widened to make it pass; the margins above are the
plan's, changed only with new probe data and an owner decision).

No `test.fail()`, no skip. The thresholds inside the k6 scripts are correctness only (`checks == 1`), checked by `assertCorrectnessThresholds` (D9).

## 8. Data isolation, cleanup, leak check

- No product data. The run directory is `results/load/<caseId>/<runId>/` (git-ignored by `results/*`), created fresh per run, so runs never mix.
- The stub binds `127.0.0.1` on a free port (`port: 0` in the runner, a fixed port only for the standalone commands) and is closed in `cleanup`.
- The leak check of this task: after `cleanup` no listener remains on the stub port (`net.connect` fails) and no `k6` child process is alive
  (`/proc/<pid>` gone). Asserted in the runner's `cleanup` stage as a `TEST BUG` finding. (Product leak checks start with Task 7.)

## 9. CI, token scan, budget

**Token scan.** New artefacts: `k6-<label>-summary.json`, `k6-<label>.json.gz`, `k6-<label>.log`, `k6-config.json`, `verdict.json`. The `tokenScan`
stage runs `scanTree` over the run directory; the job runs `node scripts/evidence-token-scan.mjs results/load` again before the upload. `.json.gz` files are
gzip: the scanner reads text, so the runner scans the **decompressed** points file (`zlib.gunzipSync` per file, in memory, in `tokenScan`) and the job step scans the
plain files only. The `url` tag is not emitted (§6.3), so no URL path with an id or token is in any file. The stub produces none of the
patterns (`Bearer `, `api_…`, `token=`): scan of the probe's `out-v230-open.json` (3.9 MB) is part of the build step 9 check.

**Budget (one convention for every Phase 3 plan).** Worst case = Phase 2 closeout §2.7 worst case (slowest green `main` job + rerun allowance; runs 39927945708, 39923528658, 40037355173, 39741411392, 39821517901, 39993081595) + the cold start after the Task 1 suffix bump (Medusa +1.1, Cal +3.0, Documenso +2.0 estimate; Twenty none) + the image pull at its 6-minute cap minus the measured 0.3 (+5.7; Twenty +5.3) + each new step. "Estimates" use the step's measured or estimated duration; "at caps" uses its `timeout-minutes`. Steps that only set a job up (checkout, setup-node, `npm ci`, summary, upload) are counted at their measured durations in a new job. At least 10 minutes under the job timeout; no timeout raised.

| Job                                                     | §2.7 worst (min) | + cold start | + pull | + install step (estimate / cap) | Worst, estimates (min) | Worst, at caps (min) | Timeout | Margin (caps) |
| ------------------------------------------------------- | ---------------- | ------------ | ------ | ------------------------------- | ---------------------- | -------------------- | ------- | ------------- |
| `medusa-smoke`                                          | 26.2             | +1.1         | +5.7   | 0.04 / 2.0                      | 33.0                   | 35.0                 | 45      | 10.0          |
| `medusa-order-races`                                    | 21.3             | +1.1         | +5.7   | 0.04 / 2.0                      | 28.1                   | 30.1                 | 45      | 14.9          |
| `medusa-cancel-extras`                                  | 7.7              | +1.1         | +5.7   | 0.04 / 2.0                      | 14.5                   | 16.5                 | 30      | 13.5          |
| `cal-smoke`                                             | 9.7              | +3.0         | +5.7   | 0.04 / 2.0                      | 18.4                   | 20.4                 | 60      | 39.6          |
| `documenso-smoke`                                       | 6.9              | +2.0         | +5.7   | 0.04 / 2.0                      | 14.6                   | 16.6                 | 45      | 28.4          |
| `twenty-smoke`                                          | 3.9              | none         | +5.3   | none (action kept, no new step) | 9.2                    | 9.2                  | 20      | 10.8          |
| **`load-selftest` (new; Task 3 and Task 4 self-tests)** | n/a              | n/a          | n/a    | install 0.04 / 2.0              | 4.6                    | 9.9                  | **20**  | **10.1**      |

`load-selftest` rows, in minutes. Estimates: setup 0.3 (checkout 1 s + setup-node 3 s + `npm ci` ≤ 10 s) + install 0.04 + coordinated-omission self-test 2.0 (3 runs × (30 s + 10 s)) + Task 4 validity self-test 1.3 + Task 4 summary and runner identity 0.3 + token scan 0.1 + upload 0.3 = 4.4, rounded up to 4.6. At caps: setup 0.3 + install 2.0 + CO self-test 3.0 + validity 3.0 + summary/identity 0.3 + scan 1.0 + upload 0.3 = 9.9. Each new step and its 80 % stop rule: install cap 2 (estimate 0.04, stop 1.6); CO self-test cap 3 (estimate 2.0, stop 2.4); token scan cap 1 (estimate 0.1, stop 0.8). The cap of Task 4's validity step is set in Task 4 (cap 3, estimate 1.3, stop 2.4).

**`load-selftest` is planned for the whole phase and keeps its 20-minute timeout.** Task 5's two self-tests (`P6-X-LOAD-002`, `P6-X-LOAD-006`) run in Task 5's own job `load-overhead`, not here; no existing timeout is raised (this job is new in this task). `medusa-smoke` is the only job at exactly 10.0 minutes of margin at caps (33.0 + 2.0); its race step is not changed (its 24.1-minute estimate against a 24.0 stop rule is a BACKLOG item, Phase 2 Q7/F12; this plan adds nothing to it). Run count: one self-test per event, 90 s of k6. Trial counts: not applicable (no races).

## 10. Expected output of the self-test run

The unit tests are listed in §12. Expected output of `npm run load:selftest` (`npm run load:selftest`), abbreviated:

```text
P6-X-LOAD-001 (functional load, not capacity) run 20261024T010203Z-3fa9c0d1
  setup        ok   stub on 127.0.0.1:<port>
  k6 open      exit 0  requests 1201 dropped 0   vus_max 80  p95 1020 ms
  k6 closed    exit 0  requests 1008 dropped 0   vus_max 4   p95 26 ms
  k6 undersized exit 0 requests 1031 dropped 170 vus_max 5   p95 26 ms
  R1..R6       ok
  tokenScan    ok   clean
  verdict      PASS  results/load/P6-X-LOAD-001/20261024T010203Z-3fa9c0d1/verdict.json
```

## 11. Environment changes (exact steps)

**One pinned k6: 2.3.0, checksum-verified, in `.k6-version` + `scripts/k6-sha256.txt`.**

### Cursor Cloud

- **Automatic from the repo (no action by the maintainer):**
  - `.cursor/environment.json` → `"install": "npm ci && bash scripts/bootstrap.sh medusa && bash scripts/install-k6.sh"`. It runs on every environment build/start; the script is idempotent
    (`k6 2.3.0 already installed` when current) and uses `sudo` for `/usr/local/bin` (the image user `ubuntu` has passwordless sudo). `/usr/local/bin` is first on `PATH`
    (AGENTS.md), so it shadows any older `/usr/bin/k6`.
  - `.cursor/Dockerfile`: delete the block "k6 from the official Grafana apt repo" (the `curl … key.gpg`, `sources.list.d/k6.list`, `apt-get install -y k6` RUN). It affects the next image build only.
- **By hand:** rebuild the environment image in Cursor's environment settings so the apt k6 disappears (cosmetic: until then both binaries exist and the pinned one wins by `PATH`).
  Nothing to paste.

### Claude Code cloud

- **Automatic from the repo:** `.claude/hooks/session-start.sh` (runs at every cloud session start, root) gets, before the final `exit 0`:

```bash
# P6: one pinned k6 (.k6-version) in every environment. The base image carries an older k6 (1.3.0 on 2026-10-24).
if ! bash "$(dirname "$0")/../../scripts/install-k6.sh" >/tmp/p6-k6-install.log 2>&1; then
  echo "P6: pinned k6 install failed (see /tmp/p6-k6-install.log). Allow github.com and release-assets.githubusercontent.com under Network access." >&2
fi
```

Cost: 0.1 s when current, 2.6 s when it installs (probe). `AGENTS.md` gets one line (§6.1) naming the version and `scripts/install-k6.sh`.

- **By hand (only if needed), in the environment's settings (cloud environment menu in the session's title bar → Edit):**
  1. **Network access → Allowed domains** (shown under the Limited level): add `github.com` and `release-assets.githubusercontent.com` if the hook prints the warning above. In the probe session both answered
     (§3.2), so this is not needed there; the maintainer's environment policy is not visible from a session: build-time probe must confirm.
  2. **Optional, to bake k6 into the cached environment** (the first session then skips the 2.6 s download): paste into the **Setup script** (it starts one directory above the repository):
     `cd k6-load-concurrency-suite && bash scripts/install-k6.sh`. If the repository directory has another name, use that name. This line never changes when the pin changes: it calls the repo script.
- Without either manual step the hook alone keeps new sessions on the pin.

### GitHub Actions

Automatic: the `perf.yml` edits of §6.8. No secret, no new action, no new permission. `grafana/setup-k6-action` is no longer used in five jobs (no verification, §3.2); `twenty-smoke` keeps it, pinned to `.k6-version`.

## 12. Build order (one commit per step; `npm run check` after each)

Run from the repo root with `export PATH="/usr/local/bin:$PATH"`. Branch: `git switch -c feat/<build date>-p6-load-foundation origin/main`.
Counts are relative to the baseline B of §5 check 4 (B = count on main when the build starts; 503 today after Tasks 1 and 2). `k6 version` before step 1 may be 1.3.0 (this VM); after step 1 it must be 2.3.0.

| Step | Commit subject                                                               | `git add` paths                                                                                                                                                                                                                                                       | Expected (`npm run check`)                                                                                                     |
| ---- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 0    | `docs(plans): bring the phase 3 task 3 plan onto the build branch`           | `docs/plans/2026-10-24-p6-phase3-task3-load-foundation.md`                                                                                                                                                                                                            | exit 0, B                                                                                                                      |
| 1    | `chore(k6): pin k6 2.3.0 with a checksum-verified installer`                 | `.k6-version scripts/install-k6.sh scripts/k6-sha256.txt scripts/lib/k6-pin.mjs tests/unit/k6-pin.test.ts`                                                                                                                                                            | run `bash scripts/install-k6.sh` → `k6 v2.3.0`; exit 0, **B + 3**                                                              |
| 2    | `chore(k6): fail the check when the installed k6 is not the pin`             | `scripts/k6-inspect.mjs`                                                                                                                                                                                                                                              | exit 0 with k6 2.3.0; with another k6 first on `PATH` the check exits 1 and prints the install command; B + 3                  |
| 3    | `feat(k6): add the sizing and option helpers of the workload library`        | `k6/lib/pure/sizing.js k6/lib/pure/options.js tests/unit/k6-lib-sizing.test.ts tests/unit/k6-lib-options.test.ts tsconfig.races.json`                                                                                                                                 | exit 0, **B + 14**                                                                                                             |
| 4    | `feat(k6): add the prefix, journey and config helpers`                       | `k6/lib/pure/prefix.js k6/lib/pure/journey.js k6/lib/pure/config.js tests/unit/k6-lib-prefix.test.ts tests/unit/k6-lib-journey.test.ts tests/unit/k6-lib-config.test.ts`                                                                                              | exit 0, **B + 26**                                                                                                             |
| 5    | `feat(k6): add the k6-facing library modules and the self-test script`       | `k6/lib/config.js k6/lib/http.js k6/selftest/coordinated-omission.js k6/selftest/config.example.json`                                                                                                                                                                 | exit 0, B + 26; `k6 inspect` lists every file under `k6/` as ok (the count is recorded in the PR; module files pass, see note) |
| 6    | `feat(load): add the stub server`                                            | `src/load/stub-server.ts tests/unit/stub-server.test.ts`                                                                                                                                                                                                              | exit 0, **B + 31**                                                                                                             |
| 7    | `feat(load): add the runner core, summary parser and verdict`                | `src/load/types.ts src/load/paths.ts src/load/env.ts src/load/summary.ts src/load/k6-process.ts src/load/stages.ts src/load/runner.ts src/load/co-relations.ts src/load/cases.ts scripts/load/run-load.ts tests/unit/load-*.test.ts package.json tsconfig.races.json` | exit 0, **B + 51**                                                                                                             |
| 8    | `ci(perf): install the pinned k6 and run the coordinated-omission self-test` | `.github/workflows/perf.yml`                                                                                                                                                                                                                                          | exit 0 (actionlint silent), B + 51                                                                                             |
| 9    | `chore(env): install the pinned k6 in the cursor and claude cloud setups`    | `.cursor/Dockerfile .cursor/environment.json .claude/hooks/session-start.sh AGENTS.md`                                                                                                                                                                                | exit 0, B + 51; `shellcheck .claude/hooks/session-start.sh` clean                                                              |
| 10   | `docs: explain how to read a load run`                                       | `README.md`                                                                                                                                                                                                                                                           | exit 0, B + 51                                                                                                                 |

Note on step 5: `scripts/k6-inspect.mjs` runs `k6 inspect` on every `k6/**/*.js`, including the library modules. Probe: a module without `export default` and without
`options` passes `k6 inspect` (exit 0, both a pure module and one that imports `k6/http`), so nothing is excluded. The PR records the final
`k6 inspect: N script(s) ok.` line.

New unit tests, by name (the 51): `k6-pin` (3: matching version, mismatch, unparsable output); `k6-lib-sizing` (5: Little's law example 40 × 1.6 → 80; minimum 1; maxVUs headroom;
plannedIterations; non-positive rate throws); `k6-lib-options` (6: open scenario shape; ramping shape peak sizing; closed shape; standardOptions has no `url` system tag and the fixed trend stats; threshold guard
accepts `checks` and `http_req_failed{...}`; guard rejects `http_req_duration`); `k6-lib-prefix` (4: accepts a real prefix; rejects others; caseDataPrefix is `[a-z0-9-]`; iterationId and attendeeEmail);
`k6-lib-journey` (5: all steps ok; stops at the first failure; think time only between ok steps; check called per step; state merged from step data); `k6-lib-config` (3: file wins over absent env; missing required key throws; empty text gives `{}`);
`stub-server` (5: delay inside and outside the stall window, exactly at the boundary; `startStub` answers 200 JSON; `close` frees the port; rejects non-127.0.0.1); `load-summary` (4: normal;
missing dropped is 0; `vus_max` both shapes; crossed thresholds list); `load-co-relations` (8: all pass on the probe numbers; each of R1 to R6 fails alone when its input is
broken (6); margins are exposed as constants); `load-runner` (6: evaluateVerdict PASS, FAIL on exit mismatch, FAIL on PRODUCT BUG even when invalid, INVALID, ENV on setup failure; stage order + cleanup after a throw
using fake stages); `load-paths` (2: run id format; runDir). Count: 3+5+6+4+5+3+5+4+8+6+2 = **51**. Per-step cumulative counts: step 1 +3 → B+3; step 3 +11 (sizing 5, options 6) → B+14; step 4 +12 (prefix 4, journey 5, config 3) → B+26; step 6 +5 → B+31; step 7 +20 (summary 4, co-relations 8, runner 6, paths 2) → B+51.

After step 10: `git push -u origin feat/<build date>-p6-load-foundation`, `gh pr create` (rule A3), read CI once (rule 15): `load-selftest` green; then
three `workflow_dispatch` runs of the branch to confirm the margins of §7 on the runner before merging (§3.6 item 2). Merge only when the owner says "merge".

## 13. Risks, proposed extras, open questions

| ID  | Risk                                                                                 | Mitigation                                                                                                        |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| R1  | A k6 major version (1.8.2 → 2.3.0) breaks a script                                   | §3.2 notes read; smokes pass on 2.3.0 for Medusa and Cal; `k6 inspect` ok; Documenso/Twenty in Tasks 7/Phase 5    |
| R2  | The maintainer's cloud networks block the download host                              | hook warns with the exact domains; optional setup-script line; §11                                                |
| R3  | A relation flips on a noisy runner                                                   | margins ≥ 3× the probe; three dispatch runs before merge; Task 4 turns noise into INVALID, never a widened margin |
| R4  | The pinned hashes are wrong or the release is replaced                               | build check 3 re-fetches the release checksums; a mismatch fails the install                                      |
| R5  | `allowJs` in `tsconfig.races.json` pulls k6-importing files into the Node type-check | the glob includes only `k6/lib/pure/**`; `types: ["node"]` has no `k6/*`; typecheck would fail loudly             |
| R6  | `k6 inspect` rejects modules without `export default`                                | probed: it does not (exit 0 for a pure module and for one importing `k6/http`)                                    |

**Contradictions with the roadmap.**

| #   | Roadmap says                                                          | Probe shows                                                                   | Effect                                                                           |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| C1  | Task 4 builds the LOAD runner skeleton                                | Task 3's self-test needs a runner to orchestrate three k6 runs and judge them | the runner core is built here; Task 4 adds validity and readiness                |
| C2  | CI pins 1.8.2 via the action "lines 31, 89–91, 277–279, 536–538"      | six installs, lines 91, 293, 467, 641, 1128, 1339                             | the plan uses the current lines                                                  |
| C3  | "keep `grafana/setup-k6-action` if it installs that exact version"    | the action installs 2.3.0 but never verifies it                               | replaced in five jobs; `twenty-smoke` keeps it pinned to `.k6-version` (Phase 5) |
| C4  | Claude Code cloud: "the maintainer pastes the exact k6 install lines" | the repo hook can install it automatically; the paste becomes optional        | §11                                                                              |

**Proposed extras (out of scope until the owner accepts them; new IDs).**

- `P6-X-LOAD-010`: the self-test also runs a `ramping-arrival-rate` leg and checks the achieved rate against the schedule (the library ships `rampingOpenScenario`; Phase 4 needs it proven).
- `P6-X-LOAD-011`: a weekly job that downloads the newest k6 release checksums and opens an issue when `.k6-version` is behind (no auto-bump).

**Owner decisions (all five questions closed 2026-10-24).**

- **Q1 (closed: pin k6 2.3.0).** Pin 2.3.0 (latest stable, a major jump from 1.8.2) as probed? Proposed: yes. The alternative, the last 1.x (1.8.2), keeps CI as is but leaves the cloud images' 2.3.0 and 1.3.0 to be downgraded and gets no 2.x fixes.
- **Q2 (closed: `k6/lib` in JavaScript for now).** Keep `k6/lib` in JavaScript (roadmap D11, repo `checkJs`) or move it to TypeScript now that k6 2.3.0 runs `.ts` natively? Proposed: JS now; TypeScript is a later, mechanical change.
- **Q3 (closed: the hook downloads k6 automatically and warns on failure).** Allow the SessionStart hook to download k6 in Claude Code cloud sessions (automatic), or keep it warn-only and rely on the pasted setup-script line? Proposed: automatic, warn on failure.
- **Q4 (closed: accept; Task 4 Q1 then makes INVALID a warning with a green job).** Exit code for `INVALID` (3): should the CI step go red or stay green with the summary line? Proposed: red until Task 4 defines the rule; Task 4's plan decides with data.
- **Q5 (closed: accept).** Accept the contradiction C1 (runner core built in Task 3)?

## 14. Done when (roadmap, made measurable)

- [ ] One k6 version: `.k6-version` = 2.3.0; `perf.yml` has no top-level `K6_VERSION` definition, and only `twenty-smoke` uses `setup-k6-action` (its version is read from `.k6-version`); the Cursor install step and the Claude hook call `scripts/install-k6.sh`; `grep -rn "1.8.2" .github scripts .cursor .claude` finds nothing about k6.
- [ ] `npm run check` fails when the installed k6 differs from the pin (demonstrated once with another version on `PATH`, output pasted in the PR) and still skips when k6 is absent.
- [ ] Library unit tests green; `npm run check` exit 0 with **B + 51** unit tests (554 on today's chain).
- [ ] The self-test shows R1 to R6 in CI on the PR and once on `main` (job `load-selftest`, `verdict.json` outcome `PASS`, artefact `load-selftest` uploaded after a clean token scan).
- [ ] All existing smokes green on 2.3.0 in CI (the six jobs of §9).
- [ ] Every new k6 script (`k6/selftest/coordinated-omission.js`) also runs standalone with `k6 run`; the exact commands are in the script header and README (§6.9).

## 15. Rule 20 self-check

- (a) Done-when above; gaps: the maintainer's network policy (§3.6 item 1) and the CI margins (item 2), settled before merge.
- (b) Existing names grepped at `5acd2a0`: `.github/workflows/perf.yml` (`K6_VERSION`, six `grafana/setup-k6-action` steps), `scripts/k6-inspect.mjs`, `.cursor/Dockerfile`,
  `.cursor/environment.json`, `.claude/hooks/session-start.sh`, `src/races/prefix.ts` (`p6RunPrefix`, `isP6RunPrefix`), `scripts/evidence-token-scan.mjs` (`findHits`, `scanTree`),
  `tsconfig.json`, `tsconfig.races.json`, `package.json` scripts, `k6/smoke/*`. Everything else in §6 is NEW with a skeleton.
- (c) CI time: §9 includes the install caps, the self-test and setup; the smallest margin at caps is 10.0 minutes (`medusa-smoke`); no timeout raised.
- (d) Skeletons: §6. Steps with `git add` paths, subjects and expected output: §12.
- (e) The owner's answers to Q1 to Q5 are recorded in §1 and §13.
