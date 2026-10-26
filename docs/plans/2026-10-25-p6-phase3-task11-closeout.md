# P6 Phase 3 Task 11: Phase 3 closeout, release filter and the smoke p95 medians (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Structure follows
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md). Scope source: roadmap
[2026-10-22-p6-phase3-roadmap.md](2026-10-22-p6-phase3-roadmap.md) "Task 11: Phase 3 closeout", plus Phase 4 roadmap
[2026-10-22-p6-phase4-roadmap.md](2026-10-22-p6-phase4-roadmap.md) D2 (the smoke p95 medians), D13 (`k6/thresholds/`) and D14 (the
evidence-release filter). Rules: [docs/agent-rules.md](../agent-rules.md), rule 19 (phase closeout) and the template
[docs/templates/phase-closeout.md](../templates/phase-closeout.md).

**Paths.** Every path below is a path on `main` after the Phase 3 stack has merged. A path that exists only on the Task 10 branch
(`origin/feat/2026-10-24-p6-retry-storms`, PR still open when this plan was written) is marked "(Phase 3 Task 10, merging)".

## 1. Header

- **Task.** Phase 3 Task 11. Cases: all Phase 3 cases (evidence only); `P6-RULE-001`, `P6-RULE-002` checked; D14 (release filter);
  the journey-smoke p95 medians that Phase 4 Tasks 2 to 4 read (D2).
- **Plan branch.** `plan/2026-10-25-p6-phase4a-plans` (no PR, never deleted).
- **Build branches (pattern).** Two, because the evidence must exist on `main` before the notes can list it:
  `ci/<build date>-p6-phase3-closeout-prep` (part 11a, code and CI) and `docs/<build date>-p6-phase3-closeout` (part 11b, notes,
  README, closeout, medians file). See C1 in §13.
- **Base.** `origin/main` after Phase 3 Tasks 1 to 10 have merged. Measured on 2026-10-25: `main` = `ba3ee19` (Tasks 1 to 9 merged) has
  **790** unit tests (759 at `a86fbfc`, before PR #61); the Task 10 branch head `c48faff` has **818**.
- **Harness pin.** Unchanged (`v0.2.15`). **Environment change.** None.
- **Unit tests.** B = count on `main` when the build starts (818 expected once Task 10 is merged; **re-measure**, §5 check 2).
  Part 11a adds **+16**, part 11b adds **+7** (§12). Expected end: **B + 23 (841 on today's chain)**.
- **Stop for owner review.** Yes (rule 10): part 11a changes `evidence-release.yml` and the `perf.yml` concurrency group (a CI
  workflow). Decisions that need the owner are in §13 "Open decisions".

## 2. What it proves

- **Phase 3 is evidenced, not merged.** Every LOAD case (`P6-CAL-LOAD-001`, `-007`, `-009`; `P6-MED-LOAD-001`, `-002`, `-006`;
  `P6-DOC-LOAD-001`, `-002`, `-007`, `-008`; the four product-free self-tests) has at least three VALID `main` runs from the same
  day's dispatches, each with its `run-meta.json`, listed by run id in the release notes. INVALID runs are listed with their
  reasons and excluded (`P6-RULE-005`).
- **A published number is bound to its environment.** The README "Phase 3 results" table carries the label "functional load, not
  capacity" and a link to a `run-meta.json` on every row (enforced by `tests/unit/readme-rules.test.ts`).
- **The stop rule of Phase 4 has an input.** `k6/thresholds/smoke-p95.json` holds, per product, the median of the journey-smoke
  `http_req_duration` p95 over at least three VALID runs, with the run ids. Phase 4 Tasks 2 to 4 read the number from this file and
  nowhere else (D2).
- **Finance and healthcare.** The same discipline as an audited baseline: the reference measurement is taken before the stress
  test, from the same environment class, and nobody can quote a figure without its provenance.

## 3. Live probe evidence

Probe date 2026-10-25 (UTC). Cloud VM (Node v22.23.3, 4 vCPU, 16 GB), k6 2.3.0, harness v0.2.15 (`npm ci` on the Task 10 head in a
detached worktree). Commands that touch a product used `npm run up:cal` and later `down:cal`. GitHub data was read with the
read-only Actions API and `gh run download` (no workflow was dispatched by this session). **VM timings prove that a step works; CI
values are marked "confirm in the first CI dispatch".**

### 3.1 Which runs exist (roadmap probe item 1)

There is **no nightly or dispatch run on `main` with LOAD steps yet.** `perf.yml` runs on `main` today are push runs of the merge
commits (for example [40141809613](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40141809613), merge of PR
#59, success, head `cf10c9b`). The owner is dispatching the Task 10 branch (not `main`: not publishable, `ref` is not `main`).
So the three runs Task 11 needs do not exist; the owner creates them by dispatching `perf.yml` on `main` three times after part 11a
has merged (§6.5 gives the procedure). What one existing push run's artefacts look like (read with
`gh run download 40141809613 -n load-cal -D …`; example only, **not** counted: it is a push run on an older head):

| Case              | outcome | validity | profile | requests | dropped | http p95 (ms) | k6 cores avg | runner busy avg |
| ----------------- | ------- | -------- | ------- | -------- | ------- | ------------- | ------------ | --------------- |
| `P6-CAL-LOAD-001` | PASS    | VALID    | full    | 120      | 0       | 75.8          | 0.012        | 7.5 %           |
| `P6-MED-LOAD-001` | PASS    | VALID    | full    | 270      | 0       | 235.5         | 0.012        | 29.9 %          |
| `P6-DOC-LOAD-001` | PASS    | VALID    | full    | 270      | 0       | 259.0         | 0.012        | 13.8 %          |

Layout of a downloaded LOAD artefact: `<artefact name>/<case id>/<run id>/{verdict.json, run-meta.json, audit.json, k6-config.json,
k6-main-summary.json, k6-main.json.gz, k6-main.log}`. `verdict.json` `k6[0].p95Ms` is the number the medians read.

### 3.2 Do full-duration LOAD steps fit each job timeout? (probe item 2)

Yes, by a wide margin. Runner values from the Task 10 branch dispatch [40144142420](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40144142420)
(`full` profile, success):

| Job               | Job time (min) | Timeout (min) | LOAD steps (s)                                                                     |
| ----------------- | -------------- | ------------- | ---------------------------------------------------------------------------------- |
| `cal-smoke`       | 6.6            | 60            | `-001` 34, `-007` 32, `-009` 33                                                    |
| `medusa-load`     | 3.1            | 45            | `-001` 41, `-002` 38, `-006` 41                                                    |
| `documenso-smoke` | 8.0            | 45            | `-001` 33, `-002` 34, `-008` 32, `-007` 34                                         |
| `medusa-smoke`    | 18.3           | 45            | (no LOAD step; races only; the backlog item about its 24.0-minute stop rule stays) |

A full `perf.yml` run took about 20 min wall time (push run 40141809613: 23:12:58 to 23:33:13 UTC). Three runs one after another:
about 1 h.

### 3.3 Does the artefact download cover the new names, and what does the filter drop? (probe item 3)

`evidence-release.yml` step "Check each run, then download its artefacts" runs `gh run download <id>` (all artefacts of the run) and
then `find … -type f ! -name '*.json' ! -name '*.log' -delete`. The artefacts of the run above: `load-cal` 22 KB, `load-medusa`
39 KB, `load-documenso` 37 KB, `load-selftest` 626 KB, `load-overhead` 1.16 MB. So the download covers `load-*` (it takes every
artefact); the **filter** is what loses files. A LOAD run directory written by the runner with telemetry on (the product-free
`npm run load:telemetry-selftest -- --profile pr`, 95 s on the VM):

```text
$ find results/load -type f | sed 's/.*\.//' | sort | uniq -c
      3 csv      telemetry-<label>.csv        (per-second app process rows)
      3 gz       k6-<label>.json.gz           (k6 points, 148 KB per 30 s at 40 req/s)
      3 html     chart-<label>.html           (self-contained chart, 5.7 KB for 30 s)
      9 json     verdict, run-meta, audit, k6-config, k6-<label>-summary, telemetry-<label>
      3 log      k6-<label>.log
```

So today's filter drops `csv`, `html` and `gz`: the release would hold no chart and no telemetry csv (roadmap D14). The widened
allowlist (§6.2) is `json log csv html txt`.

**The `.json.gz` points file is not on the allowlist, on purpose.** `scripts/evidence-token-scan.mjs` reads every file with
`readFileSync(file, "utf8")` (`scanTree`) and gitleaks `dir` does not unpack archives by default, so a `.gz` file is never really
scanned. D14 says the scanners stay unchanged. Therefore the points file stays in the 14-day Actions artefact only (open decision
Q2). Probe: `node scripts/evidence-token-scan.mjs <run dir>` over the whole directory, html and csv included: `token scan: clean`.

### 3.4 Phase 3 gap found by the probe: product LOAD cases ship no telemetry and no chart

The artefact of §3.1 has **no** `telemetry-*.csv`, `telemetry-*.json` or `chart-*.html`. Cause: `src/load/cases.ts` sets
`telemetry: { product }` on no product case (only the stub self-tests), and `startRunTelemetry` runs only when the case or the run
asks (`telemetryWanted`, `src/load/telemetry/stages.ts`). The Phase 3 exit ("every LOAD run ships a k6 summary, telemetry, a chart
and a post-load audit") is therefore not true yet for product cases, and Phase 4 needs the product sources (pg, log, probe) for
"first saturated resource". Probe of the fix, a throwaway script outside the repo that copies `CAL_LOAD_001` with
`telemetry: { product: "cal" }` (scratch file, nothing committed), Cal started with `npm run up:cal`:

```text
$ node <scratchpad>/run-tel.mjs P6-CAL-LOAD-001 full
P6-CAL-LOAD-001 INVALID results/load/P6-CAL-LOAD-001/20261025T000845Z-e8d79254/verdict.json   (1 iteration dropped on the cold VM)
files: audit.json chart-main.html k6-config.json k6-main-summary.json k6-main.json.gz k6-main.log run-meta.json
       telemetry-main.csv telemetry-main.json verdict.json
telemetry.sources: proc true, db true, container true, log true, probe true
telemetry-main.json: 31 samples, intervalMs 1000, sample 10 =
  {"proc":{"cpuTicks":1655,"rssMb":644,"fds":53,"members":1},
   "db":{"active":1,"idleInTx":0,"waiting":0,"total":21,"waitingLocks":0,"commits":8861,"deadlocks":0},
   "log":{"errorLines":2,"http5xx":0,"knownNoise":{"smtp":16,"dailyVideo":2}}, "probe":{"ok":true,"status":200,"ms":171}}
token scan of the run directory: clean
```

What this sets, and what it leaves open:

- All five sources open for Cal and the chart/csv/json files are written. The csv holds only the process columns
  (`t,cpuTicks,rssMb,fds,members,sampleCostMs`); db, log and probe values are in `telemetry-<label>.json`. Both are on the allowlist.
- `telemetry.sources.container` is `true` but `sources.container.errors` is **31 of 31 samples** on this VM: `stat -f -c %T
/sys/fs/cgroup` prints `tmpfs`, `detectCgroup` treats anything but `cgroup2fs` as cgroup v1 and the v1 paths do not exist. This
  is a VM property (the GitHub runner uses cgroup v2): **UNPROBED: confirm in the first CI dispatch** (read `sources.container.errors`
  in `telemetry-<label>.json`). If it is also 31 of 31 on the runner it is a TEST BUG in `detectCgroup`, to fix before Task 1 of
  Phase 4 (the container source is one of the "first saturated resource" inputs).
- The case scripts do not call the clock markers (`k6/lib/markers.js`), so `skewMs` stays undefined and the clock-skew check is
  silent for product cases. §6.4 adds the hooks (probed below).
- One dropped iteration on the cold first run on the VM (INVALID, correctly). It is not a CI value; nothing is concluded.

Probe of the marker hooks (k6 2.3.0, throwaway script, the destructured export):

```text
export const { setup, teardown } = hooks(__ENV.MARKER_URL);     // hooks() returns { setup() {…}, teardown() {…} }
$ MARKER_URL=x k6 run --summary-export s.json h.js     -> custom Trend p6_clock_offset_start_ms=avg 1.5 (setup and teardown ran)
```

So one shared helper in `k6/lib/markers.js` can give every case script both hooks in one line.

### 3.5 Issue templates (probe item 4)

Read from the local clones under `PRODUCTS_ROOT` (`/home/user/products`):

| Product   | Template found                                                                                                                | Note                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Cal       | `.github/ISSUE_TEMPLATE/bug_report.md`: Issue Summary, Steps to Reproduce, Actual Results, Expected Results, … (`config.yml`) | the sections are the draft's headings                                                                           |
| Medusa    | **none** in the fork (`.github/workflows/update.yaml` only)                                                                   | the Medusa fork is a starter; the upstream bug template lives in medusajs/medusa: UNPROBED, fetch at build time |
| Documenso | the local `documenso` folder is not a git checkout and has no `.github`                                                       | **UNPROBED: confirm at build time** with `gh api repos/documenso/documenso/contents/.github/ISSUE_TEMPLATE`     |

Phase 3 adds one new known bug since the Phase 2 closeout: `P6-OBS-DOC-005` (Documenso duplicate seal of the retry storm, Phase 3
Task 10, merging). Upstream drafts for it are written in 11b in the Documenso template.

### 3.6 Concurrency (found while reading `perf.yml`; no probe needed, no workflow dispatched)

`perf.yml` has `concurrency: group: perf-${{ github.event_name == 'schedule' && 'nightly' || github.ref }}` with
`cancel-in-progress: true`. A `workflow_dispatch` on `main` and a push to `main` share the group `perf-refs/heads/main`, so a new
dispatch, a push or a PR merge **cancels a dispatch run that is still going**. The owner's "three dispatches one after another"
would lose runs if one started before the previous finished or if anything merged meanwhile. §6.3 gives dispatch runs their own
group.

### 3.7 What the probe could not confirm ("confirm in the first CI dispatch" or at build time)

1. Container source on the runner (§3.4).
2. The p95 medians themselves (they come from the three dispatches).
3. Documenso and Medusa upstream issue templates (§3.5).
4. Retention: artefacts expire after 14 days (`retention-days: 14`). The release must be created within 14 days of the first of the
   three runs, or the download in `evidence-release.yml` fails. Release notes are written in 11b the same week.

## 4. Depends on earlier plans

Phase 3 Tasks 1 to 10 merged. Names used (grepped on the Task 10 head, all present): `src/load/medians.ts` (`selectPublishable`,
`summarizeMedian`, `medianOf`), `src/load/published.ts` (`formatPublishedNumber`), `src/load/run-meta.ts` (`isPublishable`,
`validateRunMeta`, `PUBLISH_EVENTS`), `scripts/load-medians.ts`, `src/load/cases.ts` (`CASES`, `CAL_LOAD_001`, `MED_LOAD_001`,
`DOC_LOAD_001`, …), `src/load/telemetry/stages.ts` (`telemetryWanted`, `samplerStart`), `k6/lib/markers.js`
(`recordClockStart`, `recordClockEnd`), `scripts/evidence-token-scan.mjs`, `.github/workflows/evidence-release.yml`,
`tests/unit/readme-rules.test.ts`. From Task 10 (Phase 3 Task 10, merging): `P6-CAL-LOAD-007`, `-009`, `P6-MED-LOAD-006`,
`P6-DOC-LOAD-007`, `P6-OBS-DOC-005`, `src/load/known-bug-gate.ts`. From Task 9: `P6-DOC-LOAD-002`, `-008`.

## 5. Build-time recheck

| #   | Check                        | Command                                                                                                                                                                             | Expected                                                                                  |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | Base                         | `git fetch origin main && git log -1 --format=%h origin/main`; `git log origin/main --oneline \| grep -c "retry storm\|P6-CAL-LOAD-007"`                                            | Task 10 merged (grep ≥ 1); otherwise stop and report                                      |
| 2   | Baseline                     | `export PATH="/usr/local/bin:$PATH"; npm run check`                                                                                                                                 | exit 0; `# tests` = B (818 expected); write B into the PR                                 |
| 3   | Names                        | `grep -n "export function summarizeMedian" src/load/medians.ts; grep -n "telemetryWanted" src/load/telemetry/stages.ts; grep -n "p95Ms" scripts/load-medians.ts src/load/runner.ts` | first two found; `p95Ms` found in `runner.ts` (verdict) and absent from `load-medians.ts` |
| 4   | The filter as it is          | `grep -n "type f ! -name" .github/workflows/evidence-release.yml`                                                                                                                   | one hit (line ~118)                                                                       |
| 5   | The concurrency group        | `grep -n "group: perf-" .github/workflows/perf.yml`                                                                                                                                 | one hit, `github.event_name == 'schedule' && 'nightly' \|\| github.ref`                   |
| 6   | Product cases lack telemetry | `grep -c "telemetry:" src/load/cases.ts`                                                                                                                                            | counts only the stub cases (4); after 11a step 3 the count rises by 10                    |
| 7   | Marker hook                  | `k6 run` of the destructured-hook script of §3.4 (copy it to the scratchpad)                                                                                                        | `p6_clock_offset_start_ms` in the output                                                  |
| 8   | Container source             | read `sources.container.errors` in the first CI dispatch's `telemetry-main.json`                                                                                                    | 0 (cgroup v2 on the runner); if equal to the sample count, TEST BUG (see §3.4)            |

## 6. Design

### 6.1 File tree

```text
scripts/ci/filter-evidence.sh                  NEW      the extension allowlist for one downloaded run (11a)
.github/workflows/evidence-release.yml         CHANGED  calls the script; prints what the release will hold (11a)
.github/workflows/perf.yml                     CHANGED  concurrency group: dispatch runs never cancel each other (11a)
k6/lib/markers.js                              CHANGED  + clockHooks(url) (11a)
k6/cases/{cal-load-001,cal-load-007,cal-load-009,med-load-001,med-load-002,med-load-006,doc-load-001,doc-load-002,doc-load-007,doc-load-008}.js
                                               CHANGED  one line each: export const { setup, teardown } = clockHooks(__ENV.MARKER_URL) (11a)
src/load/cases.ts                              CHANGED  + telemetry: { product } on the ten product cases (11a)
src/load/medians.ts                            CHANGED  + runIdOf(meta) (11a)
scripts/load-medians.ts                        CHANGED  + --metric p95, --json (11a)
src/load/smoke-baseline.ts                     NEW      buildSmokeBaseline, parseSmokeBaseline, smokeP95For (11a)
scripts/write-smoke-baseline.ts                NEW      CLI that writes k6/thresholds/smoke-p95.json from run folders (11a)
tests/unit/filter-evidence.test.ts, load-medians-p95.test.ts, smoke-baseline.test.ts, load-cases-telemetry.test.ts   NEW (11a)
k6/thresholds/smoke-p95.json                   NEW      the medians with their run ids (11b)
tests/unit/smoke-baseline-file.test.ts         NEW      the committed file is valid and its run ids are in the notes (11b)
docs/releases/p6-phase3.md                     NEW      release notes (11b)
docs/plans/<build date>-p6-phase3-closeout.md  NEW      rule 19 closeout from the template (11b)
README.md                                      CHANGED  "Phase 3 results", Phase 3 status, "Phase 4 (next)"; the old "Phase 3 (next)" is removed (11b)
docs/BACKLOG.md                                CHANGED  carries the open items (11b)
```

### 6.2 The release filter (D14)

`scripts/ci/filter-evidence.sh` (NEW, executable, `bash`, no new tool):

```bash
#!/usr/bin/env bash
# Keeps only allowlisted evidence files in one downloaded run directory. The scanners read text; nothing else goes into a release.
# Allowlist: json log csv html txt. Usage: filter-evidence.sh <dir>
set -euo pipefail
dir="${1:?usage: filter-evidence.sh <dir>}"
[[ -d "$dir" ]] || { echo "filter-evidence: not a directory: $dir" >&2; exit 2; }
find "$dir" -type l -delete
find "$dir" -type f ! \( -name '*.json' -o -name '*.log' -o -name '*.csv' -o -name '*.html' -o -name '*.txt' \) -delete
find "$dir" -mindepth 1 -type d -empty -delete
```

`.github/workflows/evidence-release.yml`, step "Check each run, then download its artefacts": replace the `find … -delete` line with

```yaml
bash scripts/ci/filter-evidence.sh "$RUNNER_TEMP/evidence/$id"
```

and add after the loop (inside the same `run:` block, before the scans) a listing, so the job log shows what goes into the release:

```bash
          echo "Evidence files by extension:"
          find "$RUNNER_TEMP/evidence" -type f | sed 's/.*\.//' | sort | uniq -c
          du -sh "$RUNNER_TEMP/evidence"
```

The project token scan and gitleaks steps are **not touched** (D14). Both already run over `$RUNNER_TEMP/evidence`, which now also
contains `csv` and `html`; probe: `scanTree` clean over a run directory with both. Step `timeout-minutes` stays inherited from the
job (`timeout-minutes: 30`); the step adds seconds.

Unit test `tests/unit/filter-evidence.test.ts` (3 tests), skeleton:

```ts
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const script = new URL("../../scripts/ci/filter-evidence.sh", import.meta.url).pathname;
function tree(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "filter-evidence-"));
  for (const f of files) {
    mkdirSync(join(dir, f, ".."), { recursive: true });
    writeFileSync(join(dir, f), "x");
  }
  return dir;
}

test("keeps json, log, csv, html and txt", () => {
  const dir = tree(["a/verdict.json", "a/k6.log", "a/t.csv", "a/chart.html", "a/n.txt"]);
  execFileSync("bash", [script, dir]);
  for (const f of ["verdict.json", "k6.log", "t.csv", "chart.html", "n.txt"])
    assert.ok(existsSync(join(dir, "a", f)));
});

test("deletes the points file, archives and images, and prunes the empty folder", () => {
  const dir = tree(["a/k6-main.json.gz", "a/x.zip", "b/p.png", "a/keep.json"]);
  execFileSync("bash", [script, dir]);
  assert.ok(!existsSync(join(dir, "a", "k6-main.json.gz")));
  assert.ok(!existsSync(join(dir, "b")));
  assert.ok(existsSync(join(dir, "a", "keep.json")));
});

test("deletes a symlink and rejects a missing directory", () => {
  const dir = tree(["a/keep.json"]);
  symlinkSync("/etc/hostname", join(dir, "a", "link.txt"));
  execFileSync("bash", [script, dir]);
  assert.ok(!existsSync(join(dir, "a", "link.txt")));
  assert.throws(() => execFileSync("bash", [script, join(dir, "missing")], { stdio: "pipe" }));
});
```

(`link.txt` names a `*.txt` file; the test proves the link goes even though the name is allowlisted.)

### 6.3 Dispatch runs never cancel each other

`.github/workflows/perf.yml`, top-level `concurrency`:

```yaml
concurrency:
  # Scheduled runs and manual dispatches get their own groups, so neither a push to main nor another dispatch cancels them.
  group: perf-${{ github.event_name == 'schedule' && 'nightly' || github.event_name == 'workflow_dispatch' && format('dispatch-{0}', github.run_id) || github.ref }}
  cancel-in-progress: true
```

`cancel-in-progress: true` stays: a dispatch's own group has exactly one member (its run id), so nothing is ever cancelled in it. A
push or a PR still cancels the previous push or PR run on the same ref, as today. Consequence: two dispatches started together run
in parallel on two runners (14 jobs each; the free-plan limit of concurrent jobs may queue some). Each run is independent and
equally valid. `actionlint` (part of `npm run check`) validates the expression.

### 6.4 Telemetry and clock hooks on the product cases

`k6/lib/markers.js` (CHANGED), append:

```js
/**
 * setup() and teardown() that record the clock offset at the start and at the end of the run when the runner gave a marker.
 * Use as: export const { setup, teardown } = clockHooks(__ENV.MARKER_URL);
 * @param {string | undefined} url
 */
export function clockHooks(url) {
  return {
    setup() {
      recordClockStart(url);
    },
    teardown() {
      recordClockEnd(url);
    },
  };
}
```

Each of the ten case scripts gets `import { clockHooks } from "../lib/markers.js";` and, after the `options` export,
`export const { setup, teardown } = clockHooks(__ENV.MARKER_URL);`. A case script that already defines `setup` or `teardown`
(check with `grep -n "export function setup\|export function teardown" k6/cases/*.js`; expected none, the retry cases may differ)
keeps its function and calls `recordClockStart(__ENV.MARKER_URL)` inside it instead; `k6 inspect` rejects a duplicate export.

`src/load/cases.ts` (CHANGED): add `telemetry: { product: "<product>" }` to `CAL_LOAD_001`, `CAL_LOAD_007`, `CAL_LOAD_009`
(`"cal"`), `MED_LOAD_001`, `MED_LOAD_002`, `MED_LOAD_006` (`"medusa"`), `DOC_LOAD_001`, `DOC_LOAD_002`, `DOC_LOAD_007`,
`DOC_LOAD_008` (`"documenso"`). Nothing else in those cases changes.

Unit test `tests/unit/load-cases-telemetry.test.ts` (2 tests): every case in `CASES` whose `product` is not `"stub"` has
`telemetry.product === product`; and every `k6/cases/*-load-*.js` for those ids contains `clockHooks(` (read the files as text).

Validity effect: the sampler is outside the generator (D2 of Phase 3); its cost is measured by `P6-X-LOAD-006` and stays inside the
validity limits. A telemetry gap or a skew above 100 ms now makes a product run INVALID. That is intended (it is the Phase 3 rule)
and is exactly what the three dispatch runs test: **if any product run is INVALID for `telemetry_gap` or `clock_skew`, it is a
finding, not a reason to widen a limit** (Q3).

### 6.5 The medians and the smoke baseline

`src/load/medians.ts` (CHANGED): add

```ts
/** The GitHub Actions run id of a run: the digits after /actions/runs/ in meta.environment.runUrl; undefined when absent. */
export function runIdOf(meta: RunMeta): string | undefined {
  return /\/actions\/runs\/(\d+)/.exec(meta.environment.runUrl ?? "")?.[1];
}
```

`scripts/load-medians.ts` (CHANGED): accept `--metric p95` (picks `k6[0].p95Ms`), and `--json` (prints
`{ "metric", "median", "n", "runIds": [...], "excluded": [{ "runId", "why" }] }` instead of the table). The positional arguments stay
run folders. Exit code stays 2 when fewer than three VALID runs exist.

`src/load/smoke-baseline.ts` (NEW), skeleton:

```ts
import { runIdOf, selectPublishable, medianOf, type LoadRunRecord } from "./medians.ts";

export const SMOKE_CASES = {
  "P6-CAL-LOAD-001": "cal",
  "P6-MED-LOAD-001": "medusa",
  "P6-DOC-LOAD-001": "documenso",
} as const;
export type SmokeCaseId = keyof typeof SMOKE_CASES;

export interface SmokeCaseBaseline {
  product: "cal" | "medusa" | "documenso";
  profile: "full";
  rate: number;
  durationSec: number;
  medianP95Ms: number;
  n: number;
  runIds: string[]; // GitHub Actions run ids, ascending, unique
  environment: string; // "ubuntu24 20261023.334.3, 4 vCPU" (the first run's; runs on other images are listed in notes)
}
export interface SmokeBaseline {
  schema: 1;
  metric: "http_req_duration p(95)";
  unit: "ms";
  release: string; // "p6-phase3"
  cases: Record<SmokeCaseId, SmokeCaseBaseline>;
}

/**
 * Per case: keep runs that selectPublishable accepts, with event workflow_dispatch or schedule, profile "full", the case's own id and a
 * known run id; take the median of verdict.k6[0].p95Ms. Throws with the case id and the reasons when fewer than three remain.
 */
export function buildSmokeBaseline(input: {
  release: string;
  runs: Record<SmokeCaseId, LoadRunRecord[]>;
}): SmokeBaseline {
  /* … */
}

/** Validates a parsed file: schema 1, three known cases, n ≥ 3 = runIds.length, unique digit-only run ids, medianP95Ms > 0. */
export function parseSmokeBaseline(value: unknown): SmokeBaseline {
  /* … */
}

export function smokeP95For(b: SmokeBaseline, caseId: SmokeCaseId): number {
  return b.cases[caseId].medianP95Ms;
}
```

`scripts/write-smoke-baseline.ts` (NEW): usage
`node scripts/write-smoke-baseline.ts --release p6-phase3 --out k6/thresholds/smoke-p95.json P6-CAL-LOAD-001=<dir>,<dir>,<dir> P6-MED-LOAD-001=… P6-DOC-LOAD-001=…`
where each `<dir>` is a downloaded run folder (`…/load-cal/P6-CAL-LOAD-001/<run id>`). It builds, validates with `parseSmokeBaseline`,
runs `findHits` on the text and writes the file with a final newline. It prints the table of medians and the excluded runs with their
reasons, and exits 2 when a case has fewer than three.

Unit tests (`tests/unit/load-medians-p95.test.ts`, 3; `tests/unit/smoke-baseline.test.ts`, 8; fixtures built in code, no files):
medians: `runIdOf` parses a run URL; `runIdOf` returns undefined without one; the exported pure `pickMetric("p95", record)` returns
`k6[0].p95Ms`. Baseline: median of three p95 values; four runs take the mean of the middle two; an INVALID run is excluded with its
reason; a push-event run and a `pr`-profile run are excluded; fewer than three remaining throws and names the case;
`parseSmokeBaseline` accepts a valid file; rejects `n` ≠ `runIds.length`; rejects duplicate run ids and a missing case.

### 6.6 The procedure that makes the evidence (owner actions, once 11a is on `main`)

1. The owner merges 11a (merge commit `M`). No further push to `main` is needed; §6.3 makes pushes harmless anyway.
2. Dispatch `perf.yml` on `main` three times (Actions tab, "Run workflow", branch `main`), one after another or together. Each run's
   `head_sha` must have `M` as an ancestor (it does, by construction). Nightly runs after `M` count too.
3. For every run: all jobs green; then for each LOAD case read `verdict.json`: `outcome` PASS, `validity.verdict` VALID. Download with
   `gh run download <id> -n load-cal -D /tmp/ev/<id>/load-cal` (and `load-medusa`, `load-documenso`, `load-selftest`,
   `load-overhead`). A run in which a LOAD case is INVALID or FAIL is **not** used for that case; list it in the notes with the reason.
   If fewer than three runs are VALID for a case, the owner dispatches another (INVALID resets nothing; it is only excluded).
4. `node scripts/write-smoke-baseline.ts …` (§6.5) writes `k6/thresholds/smoke-p95.json`.
5. Release notes list exactly the runs used (run ids), and `evidence-release.yml` is dispatched from `main` with `tag=p6-phase3`,
   `target_sha=<the 11b merge commit>` and `run_ids=<the same ids>`. The workflow checks the notes list exactly those runs and that each
   run is a successful `perf.yml` run on `main` whose head is an ancestor of the target.

### 6.7 Text templates

`docs/releases/p6-phase3.md` (11b; the first line must be an H1; the workflow takes the release title from it):

```markdown
# P6 Phase 3 evidence (CI)

One zip per CI run. Each zip holds the `*.json`, `*.log`, `*.csv` and `*.html` files of that run's artefacts (verdicts, run
metadata, audits, k6 summaries and logs, telemetry, charts). The k6 points files (`*.json.gz`) are not in the zips: the token scan
cannot read them. `SHA256SUMS.txt` lists the checksums. The release does not expire; the Actions artefacts do (14 days).

| Run                                                                                      | Event    | Head SHA  | What it proves                                     |
| ---------------------------------------------------------------------------------------- | -------- | --------- | -------------------------------------------------- |
| [<run id>](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/<run id>) | dispatch | `<7 hex>` | every Phase 3 LOAD case VALID; the self-tests PASS |

Excluded runs (INVALID or failed, with the reason): <none | one line per run id and reason>.

All LOAD numbers are labelled **functional load, not capacity**: the rates are small and fixed. The medians are in
`k6/thresholds/smoke-p95.json`.
```

README (11b): replace `## Phase 3 (next)` with `## Phase 3 results`, one table per product, rows exactly:

```markdown
| Case              | Runs (median of) | Requests (median) | Dropped | http p95 ms (median) | Label                         | run-meta                                                                             |
| ----------------- | ---------------- | ----------------- | ------- | -------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| `P6-CAL-LOAD-001` | 3 VALID dispatch | <n>               | 0       | <ms>                 | functional load, not capacity | [run-meta](https://github.com/Jayami123/k6-load-concurrency-suite/blob/<sha>/docs/…) |
```

Because `tests/unit/readme-rules.test.ts` requires the word `run-meta` on every table row of this section and forbids the bare word
"capacity", every row carries a `run-meta` link. The link target is the release asset or the Actions run page (the run-meta file is
inside the zip); the row text says "run-meta" so the test sees it. Add a paragraph: the master-plan Phase 3 replacement ("k6 smoke+ramp
all products; baseline.json" became "foundations + correctness under load") and the redefined IDs (Phase 3 roadmap Note 5); and a
"Phase 4 (next)" list pointing at `docs/plans/2026-10-22-p6-phase4-roadmap.md`.

## 7. Oracles and assertions

This task adds no product oracle. Its checks:

| Check                                                                        | Where                                                                                                                                                                                                                                        | Failing means                                  |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| P6-RULE-001: no latency or throughput threshold without a committed baseline | `assertCorrectnessThresholds` in `k6/lib/pure/options.js` throws on `http_req_duration`, `iteration_duration`, … (unit tests in `k6-lib-options.test.ts`); `grep -rn "http_req_duration" k6/cases k6/journeys` finds no threshold expression | TEST BUG: remove the threshold                 |
| P6-RULE-002: README numbers match the cited artefacts                        | a manual table in the closeout (README value, artefact path, artefact value, equal yes/no) for every number in "Phase 3 results"                                                                                                             | TEST BUG: fix the README                       |
| P6-RULE-003: label and run-meta on every number                              | `tests/unit/readme-rules.test.ts`                                                                                                                                                                                                            | build fails                                    |
| P6-RULE-005: ≥ 3 VALID runs per median                                       | `scripts/write-smoke-baseline.ts` exits 2; `parseSmokeBaseline` in `tests/unit/smoke-baseline-file.test.ts`                                                                                                                                  | the baseline file is not committed             |
| The release lists exactly the runs                                           | `evidence-release.yml` step "Check that the notes list exactly the selected runs"                                                                                                                                                            | the release job stops before creating anything |

The stop rule of Phase 4 (D2) ends a measurement; it is not a latency gate on a pass or fail verdict. Reading
`k6/thresholds/smoke-p95.json` in Phase 4 does not create a latency threshold in a k6 script (the Task 1 plan keeps
`assertCorrectnessThresholds` in force).

**PRODUCT BUG vs TEST BUG.** A LOAD case that is INVALID in a dispatch run is neither: it is excluded and, if the reason is
`telemetry_gap` or `clock_skew`, root-caused (a sampler or marker fault is a TEST BUG). A FAIL with a `PRODUCT BUG` stage is
reported with the run link; `P6-OBS-DOC-005` is already declared (`knownBugs`) and counted, not hidden. No expected-failure marker is
added.

## 8. Data isolation, cleanup, leak check

No new product data. Each LOAD case already runs under its run prefix with cleanup and a leak check (Phase 3 Tasks 7 to 10).
The new CLI reads downloaded folders under `/tmp/ev/` (outside the repo) and writes one file under `k6/thresholds/`. The token scan
(`findHits`) runs on the file text before it is written; `evidence-release.yml` scans again over the filtered tree before upload.

## 9. CI, token scan, budget

Budget. `perf.yml` jobs gain only the sampler (per-second reads outside the generator): the measured sampler overhead is below the
`P6-X-LOAD-006` margins; the product job times of §3.2 have 30 to 52 minutes of margin at their timeouts (`cal-smoke` 6.6 of 60,
`medusa-load` 3.1 of 45, `documenso-smoke` 8.0 of 45). No step timeout changes, none is raised. The LOAD steps keep their
`timeout-minutes` (`4` on PRs, `6` otherwise; Documenso `3`/`4`): the sampler's start/stop adds under 2 s (Cal probe: 36 s for the
whole 30 s case including setup, audit and cleanup). Stop rule at 80 % of the step timeout: Cal step 6 min cap, stop 4.8 min,
estimate 0.6 min; Medusa 6 min cap, stop 4.8, estimate 0.7; Documenso 4 min cap, stop 3.2, estimate 0.6.

`evidence-release.yml` (job `timeout-minutes: 30`): download of ~3 runs × ~2.1 MB, filter and scans take seconds; estimate 2 min, at
the job cap 30 min, margin 28. The three dispatch runs cost 3 × ~20 min of runner time; the free plan has no per-minute limit for
public repositories (UNPROBED: confirm in the first dispatch that nothing queues beyond a few minutes).

## 10. Expected output

```text
$ bash scripts/ci/filter-evidence.sh /tmp/ev/40150000001/load-cal && find /tmp/ev/40150000001/load-cal -type f | sed 's/.*\.//' | sort | uniq -c
      1 csv
      1 html
      6 json
      1 log
$ node scripts/write-smoke-baseline.ts --release p6-phase3 --out k6/thresholds/smoke-p95.json P6-CAL-LOAD-001=… P6-MED-LOAD-001=… P6-DOC-LOAD-001=…
| case            | n | median p95 ms | run ids                         |
| P6-CAL-LOAD-001 | 3 | <ms>          | <id> <id> <id>                  |
… (excluded: none | <run id>: validity INVALID: telemetry_gap)
wrote k6/thresholds/smoke-p95.json
```

(The medians are CI values; the plan has no number to give.)

## 11. Environment changes (exact steps)

None. Cursor Cloud, Claude Code cloud and the repo settings are unchanged. Nothing is pasted by hand. Manual steps are the owner's
dispatches (§6.6) and the release dispatch.

## 12. Build order (one commit per step; `npm run check` after each)

Run from the repo root with `export PATH="/usr/local/bin:$PATH"`. Counts relative to B (§5 check 2).

**Part 11a** (`git switch -c ci/<build date>-p6-phase3-closeout-prep origin/main`)

| Step | Commit subject                                                           | `git add` paths                                                                                                                                                                | Expected (`npm run check`)                                   |
| ---- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| 0    | `docs(plans): bring the phase 3 task 11 plan onto the build branch`      | `docs/plans/2026-10-25-p6-phase3-task11-closeout.md`                                                                                                                           | exit 0, B                                                    |
| 1    | `ci(evidence): keep csv, html and txt in the release, scanned as before` | `scripts/ci/filter-evidence.sh tests/unit/filter-evidence.test.ts .github/workflows/evidence-release.yml`                                                                      | exit 0, **B + 3**                                            |
| 2    | `ci(perf): give each manual dispatch its own concurrency group`          | `.github/workflows/perf.yml`                                                                                                                                                   | exit 0 (actionlint silent), B + 3                            |
| 3    | `feat(load): ship telemetry and a chart from the product cases`          | `k6/lib/markers.js k6/cases/*.js src/load/cases.ts tests/unit/load-cases-telemetry.test.ts`                                                                                    | exit 0, **B + 5**; `k6 inspect: N script(s) ok.` unchanged N |
| 4    | `feat(load): add the p95 median and the smoke baseline`                  | `src/load/medians.ts scripts/load-medians.ts src/load/smoke-baseline.ts scripts/write-smoke-baseline.ts tests/unit/load-medians-p95.test.ts tests/unit/smoke-baseline.test.ts` | exit 0, **B + 16**                                           |

Push `git push -u origin ci/<build date>-p6-phase3-closeout-prep`, `gh pr create` (rule 3), read CI once (rule 15). Merge only when the
owner says "merge". Then the owner runs §6.6 steps 2 and 3. Because the PR run itself uses the `pr` profile, it proves nothing about
the medians; the first `main` dispatch is the live check of §3.4 (container errors) and §3.2.

**Part 11b** (`git switch -c docs/<build date>-p6-phase3-closeout origin/main` after the three runs are chosen)

| Step | Commit subject                                                               | `git add` paths                                                       | Expected                                                  |
| ---- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| 5    | `chore(thresholds): record the journey smoke p95 medians with their run ids` | `k6/thresholds/smoke-p95.json tests/unit/smoke-baseline-file.test.ts` | exit 0, **B + 23**                                        |
| 6    | `docs: add the phase 3 release notes`                                        | `docs/releases/p6-phase3.md`                                          | exit 0, B + 23; the notes list the same run ids as step 5 |
| 7    | `docs: add the phase 3 results and the phase 4 pointer to the readme`        | `README.md`                                                           | exit 0 (`readme-rules` green), B + 23                     |
| 8    | `docs: close out phase 3 and carry the open items`                           | `docs/plans/<build date>-p6-phase3-closeout.md docs/BACKLOG.md`       | exit 0, B + 23                                            |

After 8: push, `gh pr create`, CI once. After the owner says "merge": the owner dispatches `evidence-release.yml` (§6.6 step 5);
the report records the release URL.

New unit tests by name (23): `filter-evidence` (3: keeps the allowlist; deletes gz/zip/png and prunes; deletes a symlink and rejects a
missing dir); `load-cases-telemetry` (2); `load-medians-p95` (3); `smoke-baseline` (8, listed in §6.5); and `smoke-baseline-file` (7: parse accepts the committed file; schema 1; three
cases; `n` equals `runIds.length` and ≥ 3; run ids unique digits; `medianP95Ms` > 0; every run id appears in
`docs/releases/p6-phase3.md` when that file exists). Count 3 + 2 + 3 + 8 = 16 (11a) and 7 (11b) = **23**. Per-step: step 1 +3, step 3
+2, step 4 +11 (medians 3, baseline 8) = B+16; step 5 +7 = B+23.

## 13. Risks, proposed extras, open decisions

| ID  | Risk                                                                | Mitigation                                                           |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| R1  | A dispatch run is cancelled by a push or another dispatch           | §6.3 own group; check each run's conclusion before use               |
| R2  | Artefacts expire (14 days) before the release                       | release within the week; the 11b notes use run ids from the same day |
| R3  | A product run is INVALID because the sampler now runs (gap, skew)   | root-cause; never widen a limit; the 3 dispatches exist to find this |
| R4  | The container source errors on the runner too                       | §3.4: TEST BUG in `detectCgroup`, fix before Phase 4 Task 1          |
| R5  | `.json.gz` points are lost from the permanent release               | Q2; the per-second csv and the chart carry the series                |
| R6  | One INVALID run resets nothing but a case may end with 2 VALID runs | dispatch another run (cost ~20 min each)                             |

**Contradictions with the roadmap.**

| #   | Roadmap says                                                                           | Probe shows                                                                                          | Effect                                                                           |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| C1  | One PR per task; Task 11 = notes, README, closeout                                     | the notes must list run ids from runs of the merged code, and the release needs the notes on `main`  | two PRs (11a code and CI, 11b notes), recorded as a routine decision             |
| C2  | "≥ 3 green nightly runs"                                                               | the owner dispatches 3 runs the same day instead (task instruction); nothing here needs the schedule | runs come from dispatches and any later nightly; run ids are listed in the notes |
| C3  | Phase 3 exit: every LOAD run ships telemetry and a chart                               | product cases ship neither (§3.4)                                                                    | step 3 fixes it before the evidence is made                                      |
| C4  | D14: allowlist "e.g. json, log, csv.gz, html, txt"                                     | the telemetry file is a plain `.csv`; the points file is `.json.gz` and cannot be scanned            | allowlist is `json log csv html txt`; `.json.gz` stays out (Q2)                  |
| C5  | `evidence-release.yml` accepts runs of one workflow (`PERF_WORKFLOW_ID` of `perf.yml`) | Phase 4 roadmap D16 allows knee and spike runs in their own workflow                                 | cross-task finding for Phase 4a Tasks 2 to 6: see the index (not changed here)   |

**Proposed extras (out of scope until accepted; new IDs).**

- `P6-X-LOAD-025`: a unit test that parses `evidence-release.yml` and fails when a step downloads artefacts without calling
  `scripts/ci/filter-evidence.sh` (keeps the filter from drifting back).
- `P6-X-LOAD-026`: `detectCgroup` falls back to `docker-stats` when the cgroup paths cannot be read (covers VM images with a
  `tmpfs` `/sys/fs/cgroup`). Gated on §5 check 8.

**Open decisions** (option, evidence, recommended default).

- **Q1. Which runs count?** (a) only `workflow_dispatch` and `schedule` runs on `main` after 11a (task instruction; recommended);
  (b) also `push` runs on `main` (`isPublishable` accepts them). Evidence: push runs exist at every merge, but their head can be a
  mid-stack merge. **Default: (a).**
- **Q2. Keep `*.json.gz` points out of the permanent release?** (a) yes, scanners are unchanged (D14; recommended); (b) add a
  decompress-and-scan step to `evidence-release.yml` and allow `json.gz`. Evidence: §3.3, a gz file is not scanned today; points are
  148 KB per 30 s at 40 req/s but grow to tens of MB for a 30-minute knee. **Default: (a)**; revisit in Phase 4 Task 6.
- **Q3. A product run INVALID by `telemetry_gap` or `clock_skew` in the dispatches.** (a) exclude and root-cause, never widen a limit
  (recommended, rule 12); (b) disable telemetry on that case. **Default: (a).**
- **Q4. Concurrency of dispatches.** (a) own group per dispatch run (§6.3; recommended); (b) leave as is and ask the owner to dispatch
  strictly one at a time and to merge nothing meanwhile. Evidence: §3.6. **Default: (a).**
- **Q5. Medusa and Documenso upstream templates.** Not found locally (§3.5). **Default:** write the drafts in the Cal template's
  headings and mark them "template UNPROBED" until the build-time `gh api` check.

## 14. Done when (roadmap, made measurable)

- [ ] 11a merged; `evidence-release.yml` uses `scripts/ci/filter-evidence.sh`; a local run of the script on a downloaded `load-cal`
      artefact keeps `csv`, `html`, `json`, `log` and removes `json.gz`.
- [ ] ≥ 3 VALID `main` dispatch (or nightly) runs per LOAD case after 11a; each product run folder has `telemetry-main.csv`,
      `telemetry-main.json` and `chart-main.html`; run ids listed in `docs/releases/p6-phase3.md`; INVALID runs listed with reasons.
- [ ] `k6/thresholds/smoke-p95.json` committed with three cases, `n ≥ 3`, run ids; `tests/unit/smoke-baseline-file.test.ts` green.
- [ ] The `p6-phase3` release exists (`gh release view p6-phase3`) and its zips contain csv and html files (list one zip with `unzip -l`).
- [ ] README "Phase 3 results" cites only those runs; `P6-RULE-001` and `-002` checked and recorded in the closeout; every open product
      bug has evidence and an upstream draft or URL; `npm run check` green with B + 23 unit tests.

## 15. Rule 20 self-check

- (a) Roadmap "Done when" items: ≥ 3 VALID runs (§6.6, from dispatches, C2), release exists, README cites only those runs,
  RULE-001/002 recorded, bug drafts, `npm run check`. Gaps: the runs themselves (owner), Medusa/Documenso templates (Q5).
- (b) Existing names grepped on the Task 10 head: `src/load/medians.ts`, `scripts/load-medians.ts`, `src/load/run-meta.ts`,
  `src/load/telemetry/stages.ts`, `k6/lib/markers.js`, `src/load/cases.ts`, `scripts/evidence-token-scan.mjs`,
  `.github/workflows/evidence-release.yml`, `.github/workflows/perf.yml`, `tests/unit/readme-rules.test.ts`. NEW with skeletons:
  `scripts/ci/filter-evidence.sh`, `src/load/smoke-baseline.ts`, `scripts/write-smoke-baseline.ts`, the tests, `k6/thresholds/`.
- (c) CI time: §9, margins at least 28 minutes; no timeout raised.
- (d) Skeletons §6; steps with `git add` paths, subjects and expected output §12.
- (e) No owner answer is recorded as given: the task instruction about the dispatches is quoted as the instruction (C2); the
  decisions above are open.
