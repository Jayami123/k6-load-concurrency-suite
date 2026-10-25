# P6 Phase 4 PRE-2: give every `cal-smoke` step a cap and bring the per-path worst case under the job timeout (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Rules: [docs/agent-rules.md](../agent-rules.md) (every workflow step has `timeout-minutes`; the worst case at the step caps is at least 10 minutes under the job
timeout; a measured step above 80 % of its cap is a stop and report, never a silent cap raise; an existing job timeout is never raised).

## 1. Header

- **Goal.** Every `cal-smoke` step has `timeout-minutes`, and the per-path worst case is at most 50 minutes (job timeout **60**, unchanged).
- **Why before Task 2.** `knee.yml` (Phase 4 Task 2) copies the `cal-smoke` setup steps **and their caps**; PRE-2 fixes those caps first. It is independent of Task 5 (the steady runs live in `knee.yml`, not here).
- **Base.** `origin/main` at `2db9726` or later (after PRE-1 is fine, the files do not overlap). **Build branch.** `ci/<build date>-p6-cal-smoke-step-caps`. **Commit type.** `ci(perf)`.
- **PR title.** `ci(perf): give every cal-smoke step a timeout and fit the job timeout`.
- **Unit tests.** B = the count on `main` when the build starts (865 at `2db9726`). This plan adds **+0** (a workflow edit; `actionlint` is part of `npm run check`).
- **Stop for owner review.** Yes (rule 10): `perf.yml` is a shared CI file. No harness pin and no shared runner label change.
- **Scope.** `cal-smoke` only, as `docs/BACKLOG.md` (Phase 3 carry-over) names it. The other jobs are listed in §5 as a finding table for a later PR; this PR does not touch them.

## 2. Evidence

Step durations come from the public jobs API (`https://api.github.com/repos/Jayami123/k6-load-concurrency-suite/actions/runs/<run id>/jobs`, no authentication) for every successful `cal-smoke` job found on 2026-10-25: **55 runs** (46 push to `main`, 6 pull
request, 3 dispatch). The three dispatch runs are the release evidence runs 40177412186, 40178773022 and 40180625279 (all `0b07594`); the pull-request runs are 40187032703, 40185238775, 40183751868, 40182880630, 40182255468 and 40176602623;
the push runs are the 46 successful `perf.yml` pushes to `main` listed by `.../actions/workflows/376454455/runs?event=push&branch=main`. Cache-save steps ran in 4 push runs (cache misses).

Before the change (script of §4, `python3 stepcaps.py .github/workflows/perf.yml --paths cal-smoke`), the sum of the step caps per path against the job timeout 60:

| path                                      | sum of caps | uncapped steps | margin |
| ----------------------------------------- | ----------- | -------------- | ------ |
| pull request                              | 62          | 19             | −2     |
| push to main (three cache saves of 5 run) | 98          | 19             | −38    |
| workflow_dispatch / schedule              | 83          | 19             | −23    |

The largest single cap is `Start Cal (harness up)` at 30 minutes (comment "plan O10": the slowest start in recent CI was 83 s) and `Race P6-CAL-RACE-001` at 15 minutes on non-PR events (the comment in the file says about 70 s).

## 3. The caps

Rule: **cap (minutes) >= 1.25 x the maximum measured duration**, rounded up to whole minutes, so the 80 % stop rule holds; a floor of 1 minute (the smallest value `timeout-minutes` takes). Max columns are seconds over the 55 runs.

| #          | Step (as in YAML)                                                        | old cap       | max: dispatch / PR / push      | new cap (PR / other) | 80 % stop    |
| ---------- | ------------------------------------------------------------------------ | ------------- | ------------------------------ | -------------------- | ------------ |
| 1          | `actions/checkout` (path `p6`)                                           | none          | 1 / 1 / 2                      | 1                    | 48 s         |
| 2          | Checkout Cal fork                                                        | none          | 5 / 4 / 10                     | 2                    | 96 s         |
| 3          | Verify Cal fork HEAD                                                     | none          | 0 / 0 / 1                      | 1                    | 48 s         |
| 4          | Verify CAL_REF matches bootstrap.sh                                      | none          | 0 / 0 / 1                      | 1                    | 48 s         |
| 5          | `actions/setup-node`                                                     | none          | 2 / 4 / 5                      | 1                    | 48 s         |
| 6          | Install P6 dependencies                                                  | none          | 8 / 8 / 9                      | 1                    | 48 s         |
| 7          | Install k6 (pinned in .k6-version, checksum-verified)                    | 2             | 1 / 1 / 1                      | 2 (unchanged)        | 96 s         |
| 8          | Enable corepack                                                          | none          | 1 / 1 / 2                      | 1                    | 48 s         |
| 9          | Restore Cal Yarn cache                                                   | none          | 9 / 8 / 14                     | 1                    | 48 s         |
| 10         | Restore Cal node_modules cache                                           | none          | 23 / 23 / 64                   | 2                    | 96 s         |
| 11         | Install Cal dependencies                                                 | none          | 53 / 87 / 115                  | 3                    | 144 s        |
| 12         | Generate Cal Prisma client                                               | none          | 8 / 8 / 8                      | 1                    | 48 s         |
| 13         | Prepare Cal product .env and harness roots                               | none          | 0 / 0 / 0                      | 1                    | 48 s         |
| 14         | Restore Cal build cache                                                  | none          | 4 / 4 / 6                      | 1                    | 48 s         |
| 15         | Pull Cal images (3 tries, 15 s then 30 s)                                | 6             | 11 / 11 / 16                   | 3                    | 144 s        |
| 16         | Start Cal (harness up)                                                   | 30            | 72 / 70 / 255                  | 6                    | 288 s        |
| 17         | Race self-test (cal-race, 3 trials)                                      | none          | 12 / 12 / 13                   | 1                    | 48 s         |
| 18         | Race P6-CAL-RACE-001 (cal-race)                                          | 5 PR / 15     | 72 / 23 / 71                   | 2 / 3                | 96 s / 144 s |
| 19         | Race P6-CAL-RACE-003 (cal-race)                                          | 5 PR / 10     | 15 / 6 / 15                    | 1 / 2                | 48 s / 96 s  |
| 20-22      | LOAD journey P6-CAL-LOAD-001, -007, -009 (three steps)                   | 4 PR / 6 each | 34 / 13 / 35                   | 1 / 2 each           | 48 s / 96 s  |
| 23         | Token scan of the LOAD results                                           | 2             | 0 / 1 / 0                      | 2 (unchanged)        | 96 s         |
| 24, 26, 27 | `actions/upload-artifact` (three steps)                                  | none          | 2 / 2 / 2                      | 1 each               | 48 s         |
| 25         | Job summary (Playwright results, race table)                             | none          | 0 / 1 / 1                      | 1                    | 48 s         |
| 28         | Stop Cal (harness down)                                                  | none          | 0 / 1 / 2                      | 1                    | 48 s         |
| 29-31      | Save Cal Yarn cache, node_modules cache, build cache (push to main only) | 5 each        | 0 / 0 / 4, 10, 5 (4 push runs) | 1 each               | 48 s         |

Every cap is lowered or newly set; none is raised (`Install k6` and `Token scan` keep their 2). Every step keeps its `if:` condition; only `timeout-minutes` lines are added or changed.

**Result, per path (script of §4 on the patched file, verified on 2026-10-25 against a copy in the scratchpad, not committed):**

| path                                      | sum of caps | uncapped steps | job timeout | margin |
| ----------------------------------------- | ----------- | -------------- | ----------- | ------ |
| pull request                              | 42          | 0              | 60          | 18     |
| push to main (with the three cache saves) | 50          | 0              | 60          | 10     |
| workflow_dispatch / schedule              | 47          | 0              | 60          | 13     |

All three are at most 50, so the fallback (a new `cal-load` job) is **not needed**. The push path is exactly 50: the margin is 10, the minimum the rule allows. `Start Cal` at 6 minutes is the largest cap and is also the one that matters on a cold build cache: on the Claude Code VM
a cold `up:cal` took about 14 minutes, and on the runner a cache miss makes that step trip its 6-minute cap. That is a visible failure and not a silent one; the caches are written by `perf.yml` pushes to `main`, so the first push after a `CAL_REF` bump may need
the owner's re-run (§8 R1). The 255 s maximum (about 4.3 minutes) in the 46 push runs is already 89 % of 288 s: **if a future measured start is above 288 s, that is a stop and report, never a silent cap raise.**

## 4. Steps and the reproduction script

`git switch -c ci/<build date>-p6-cal-smoke-step-caps origin/main`; `export PATH="/usr/local/bin:$PATH"`.

| Step | Commit subject                                                         | `git add` paths                                               | Expected                      |
| ---- | ---------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------- |
| 0    | `docs(plans): bring the phase 4 pre-2 plan onto the build branch`      | `docs/plans/2026-10-25-p6-phase4-pre2-cal-smoke-step-caps.md` | exit 0, B                     |
| 1    | `ci(perf): set the step timeouts of cal-smoke from measured durations` | `.github/workflows/perf.yml`                                  | exit 0 (actionlint silent), B |

In step 1 edit only the `cal-smoke` job: add `timeout-minutes: N` as the line after each step's first key (`- name:` / `- uses:`), change the five existing values (`Pull Cal images` 6 → 3, `Start Cal` 30 → 6 and delete its two comment lines about plan O10, the race and LOAD
ternaries, the three save steps 5 → 1), keep every `if:`. The ternaries read `${{ github.event_name == 'pull_request' && <PR cap> || <other cap> }}`.

The reproduction script (python3 and PyYAML; it only reads; keep it in the scratchpad, or commit it as `scripts/ci/step-caps.py` in a separate PR if the owner wants a permanent check):

```python
#!/usr/bin/env python3
"""Step-cap sums of every job in a workflow file. Usage: python3 stepcaps.py .github/workflows/perf.yml [--paths JOB]
naive = sum of all caps, the larger value of a `pr && a || b` expression; uncapped = steps without timeout-minutes.
--paths JOB: sums per event for one job, respecting `if:` gating on github.event_name (a cache save runs only on push)."""
import re, sys, yaml
wf = yaml.safe_load(open(sys.argv[1]))
def values(cap):
    if cap is None: return None
    if isinstance(cap, int): return {"pr": cap, "other": cap}
    m = re.search(r"pull_request' && (\d+) \|\| (\d+)", str(cap))
    if m: return {"pr": int(m.group(1)), "other": int(m.group(2))}
    raise SystemExit(f"cannot read cap {cap!r}")
def runs_on(step, event):
    cond = str(step.get("if", ""))
    if "github.event_name == 'push'" in cond: return event == "push"
    return True
if "--paths" in sys.argv:
    job = wf["jobs"][sys.argv[sys.argv.index("--paths") + 1]]
    for event in ("pull_request", "push", "workflow_dispatch"):
        total = unc = 0
        for s in job["steps"]:
            if not runs_on(s, event): continue
            v = values(s.get("timeout-minutes"))
            if v is None: unc += 1; continue
            total += v["pr"] if event == "pull_request" else v["other"]
        print(f"{event:18} sum of caps {total:3}  uncapped {unc}  job timeout {job['timeout-minutes']}  margin {job['timeout-minutes'] - total}")
else:
    print("| Job | Job timeout | Sum of caps (naive) | Uncapped steps |\n|---|---|---|---|")
    for name, job in wf["jobs"].items():
        total = unc = 0
        for s in job["steps"]:
            v = values(s.get("timeout-minutes"))
            if v is None: unc += 1
            else: total += max(v.values())
        print(f"| {name} | {job['timeout-minutes']} | {total} | {unc} |")
```

Expected output after step 1: `python3 stepcaps.py .github/workflows/perf.yml --paths cal-smoke` prints `pull_request ... sum of caps  42 ... margin 18`, `push ... 50 ... margin 10`, `workflow_dispatch ... 47 ... margin 13`, all with `uncapped 0`. Before the change it prints 62, 98, 83 and `uncapped 19`.

## 5. Finding table for a later PR (all jobs of `perf.yml` at `2db9726`; not fixed here)

The naive sum counts every step (the larger value of each ternary) and ignores `if:` gating, so it is an upper bound, not a per-path worst case. It reproduces the figures of index F13 for the jobs F13 names (cal-smoke 98 / 19, medusa-smoke 42 / 16, medusa-cancel-extras 73, medusa-multi-instance 94, documenso-smoke 66, twenty-smoke 95, twenty-races 91, twenty-obs 80, load-overhead 25) and adds the others:

| Job                                      | Job timeout | Sum of caps (naive) | Uncapped steps | Note                               |
| ---------------------------------------- | ----------- | ------------------- | -------------- | ---------------------------------- |
| medusa-smoke                             | 45          | 42                  | 16             | margin 3: below the 10-minute rule |
| medusa-order-races                       | 45          | 48                  | 15             | over the timeout                   |
| medusa-load                              | 45          | 28                  | 15             | margin 17 on the caps that exist   |
| medusa-cancel-extras                     | 30          | 73                  | 10             | over the timeout                   |
| medusa-multi-instance (both matrix legs) | 45          | 94                  | 0              | over the timeout                   |
| cal-smoke                                | 60          | 98                  | 19             | fixed by this PR                   |
| cal-state-races                          | 85          | 76                  | 17             | margin 9 on the caps that exist    |
| documenso-smoke                          | 45          | 66                  | 17             | over the timeout                   |
| twenty-smoke                             | 20          | 95                  | 0              | over the timeout                   |
| twenty-races                             | 33          | 91                  | 0              | over the timeout                   |
| twenty-obs                               | 27          | 80                  | 0              | over the timeout                   |
| load-selftest                            | 20          | 23                  | 0              | over the timeout                   |
| load-overhead                            | 25          | 25                  | 0              | margin 0                           |

(The naive sum for matrix jobs counts one leg.) A later PR per job applies the §3 method to its measured durations; none of them is part of Phase 4a.

## 6. CI cap table (G6) for the steps this PR changes

The table of §3 is the exact cap table of the changed job (`cal-smoke`, timeout 60). Sum of the step caps per path: 42 (pull request), 50 (push), 47 (dispatch); 60 − sum = 18 / 10 / 13, each at least 10. No range, no cache-save allowance beyond the three save steps that exist (1 minute each on the push path).

## 7. Done when

- [ ] `perf.yml` `cal-smoke`: no step without `timeout-minutes`; the script prints sums 42 / 50 / 47 with `uncapped 0`; the job timeout is still 60.
- [ ] The PR's own `cal-smoke` run is green and every measured step is below 80 % of its new cap (read the jobs API of that run; any step above 80 % is a stop and report).
- [ ] The first push to `main` after the merge is green with the same check (it exercises the cache-save path if a cache missed).
- [ ] `docs/BACKLOG.md` "cal-smoke step-cap total" is closed by the PR that merges this (a one-line edit in the same PR is allowed).

## 8. Risks

| ID  | Risk                                                                                                                                         | Mitigation                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| R1  | A cache miss (a `CAL_REF` bump, a cache eviction) makes `Install Cal dependencies`, `Restore ... cache` or `Start Cal` exceed the tight caps | the failure is visible; the owner re-runs after a `main` push has written the caches; no cap is raised silently. Open decision Q1 |
| R2  | The push path margin is exactly 10                                                                                                           | it satisfies the rule; any future step added to the job must lower another cap or move to a job of its own                        |
| R3  | Run-to-run spread makes a step cross 80 % of its cap                                                                                         | the PR's run is read once; a crossing is a stop and report                                                                        |

## 9. Decisions (owner, 2026-10-25)

- **Method.** Decided (owner, 2026-10-25): per-path worst case respecting `if:` gating; each cap at least 1.25 x the maximum measured duration over the evidence runs; the default fix lowers over-sized caps and adds caps to the 19 uncapped steps; the fallback (a `cal-load` job) is used only if
  50 cannot be reached. Never raise 60.
- **Order.** Decided (owner, 2026-10-25): before Task 2; independent of Task 5.
- **Scope.** Decided (owner, 2026-10-25): `cal-smoke` only; the other jobs are a finding table (§5).
- **Q1. Cold-cache behaviour.** Open (no owner answer recorded): recommended default — tight warm-path caps, a cold build fails visibly and is re-run (R1). Options: (a) tight caps (this plan); (b) a separate warm-up job that builds the caches with its own generous caps
  (more CI, more files); (c) keep `Start Cal` at 30 minutes and take the minutes from the race and LOAD steps (not possible: the push path would be 74).
