# P6 Phase 5 Task 8: closeout build plan (2026-10-29)

Junior-engineer guide. Follow the steps in order. Each step names the exact files, the commands and the
output you should see. Do not edit any file that is not named in a step.

- **Roadmap:** [2026-10-22-p6-phase5-roadmap.md](2026-10-22-p6-phase5-roadmap.md), section "Task 8: Phase 5 closeout".
- **Plan branch:** `plan/2026-10-29-p6-phase5-task8`, from `origin/main` at `f256d6e`. Plan only; no PR.
- **Build branch:** `docs/2026-10-29-p6-phase5-closeout`. It did not exist on origin when this plan was
  written (checked with `git ls-remote --heads origin`). Create it from `origin/main` (step 0).
- **Rules that apply:** [agent-rules.md](../agent-rules.md) (A1–A6, C11–C15, D16–D17, E18–E19, F20).
  Lowercase Conventional Commits. No `Co-Authored-By`, `Claude-Session`, "Generated with" or session-link
  lines in commits or PR text. No personal names. No model identifiers in any repo file. Stage with
  `git add <path>` only.

## 0. Live probe (done before this plan was written)

Every number below was read from the GitHub Actions run artefacts. No number is typed from memory.

| Probe                                   | Command or source                                                                                                                           | Result                                                                                                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-1 Twenty runs exist and are success   | `gh run view <id> --json conclusion,headBranch,event,headSha,workflowName`                                                                  | `40896799127`, `40896827889`, `40896870640`: `twenty-load`, `workflow_dispatch`, `main`, `f256d6e`, all `success`. Workflow database id of `twenty-load.yml` is `400507136`.                                                                                                          |
| P-2 Artefacts unzip                     | `gh api repos/<repo>/actions/runs/<id>/artifacts`, then `gh api repos/<repo>/actions/artifacts/<artifact-id>/zip`                           | Each run has `twenty-load-foundation`, `twenty-load-lost-update`, `twenty-rate-limit`, `tw-load-005-<id>`. All `expired=false`. Note: `gh run download` failed in the scratch directory (`failed to run git`), so use the API route.                                                  |
| P-3 Verdicts of the 3 runs              | `jq` on each `verdict.json` and `verdict-public.json`                                                                                       | Foundation PASS VALID; `P6-TW-LOAD-004` outcome PASS VALID; `-006` PASS VALID; `-009` outcome PASS VALID (fairness FINDING, see §3); `-005` `PRODUCT BUG (SUSPECTED)` VALID, finding `P6-TW-RACE-004`; `-011` PASS VALID. All 3 runs have every case VALID.                           |
| P-4 Variant B of `-004`                 | `stages.reconcile.data.lostUpdate` in each `verdict.json`                                                                                   | `variantA` PASS (0 lost). `variantB` FINDING in all 3 runs, `lostLower` 361 / 362 / 361 over 724 / 725 / 723 acknowledged increments.                                                                                                                                                 |
| P-5 A/A flags (`P6-X-LOAD-009`)         | `gh run view 40850333800 --log` and `40848345879` and `40857206947` (the `P6-X-LOAD-009 A/A flags (...)` line); artefacts `load-aa-flags-*` | `on-first` `40850333800`: PASS (p95 rel 0.0072 of tol 0.1). `off-first` `40848345879`: FAIL (p95 rel 0.1269). `off-first` `40857206947`: FAIL (p95 rel 0.1148). `40845100209` failed in setup (HEAD mismatch and pnpm version), a TEST BUG, not counted.                              |
| P-6 Soak weekly releases                | `gh api repos/<repo>/releases --jq '.[].tag_name'`                                                                                          | `p6-phase1`, `p6-phase3`, `p6-phase4`, `p6-phase4a`, `p6-phase4c`. No `p6-soak-*` release yet, so 0 of 3 weekly points. (`gh release list` is refused in this session with a GraphQL 403; use the API.)                                                                               |
| P-7 Gate evidence for `-008` and `-010` | `docs/plans/2026-10-29-p6-phase5-task3-twenty-load-foundation.md` §5 table (rows P18 and H4)                                                | `-010` NOT RUN (Later): the read route is proven, the monitor is not. `-008` NOT RUN (Later): H4 is in the pinned harness and the 429 proof passed; no API-key knee dry run yet. Details in §6.                                                                                       |
| P-8 Evidence allowlist                  | `grep -n EVIDENCE_WORKFLOW_IDS .github/workflows/evidence-release.yml`                                                                      | `376454455 396253729 397232763 398161444 400507136`. `400507136` is `twenty-load`. `400386604` (`tier-aa`) is not in it, so the A/A runs cannot be released by the workflow.                                                                                                          |
| P-9 Release size                        | zipped the allowlisted files (`*.json *.log *.csv *.html *.txt`) of each run with Python `zipfile`                                          | 41 files per run, 2.32 MB raw, 180–181 KB per zip, 0.54 MB for the three zips together.                                                                                                                                                                                               |
| P-10 Twenty's issue template            | sparse clone of `twentyhq/twenty` (read access attached by the session), `.github/ISSUE_TEMPLATE/`                                          | Templates: `report-bug.md` (name "Report a bug", label `type: bug`, sections "Bug Description", "Expected behavior", "Technical inputs"), `add-new-feature---behavior.md`, `request-technical-work.md`. Upstream HEAD on the recheck day: `0c5752d843df454a7b324c48f186e14964eb212a`. |
| P-11 Baseline `npm run check`           | `export PATH="/usr/local/bin:$PATH"; npm run check; echo exit=$?` on `plan/2026-10-29-p6-phase5-task8` (no code change)                     | `exit=0`. Prettier ok, actionlint ok, `tsc` ok, k6 inspect ok, unit tests `# tests 1561`, `# pass 1561`, `# fail 0`.                                                                                                                                                                  |

## 1. Medians (the README numbers)

Medians of the three VALID `main` runs above. Metric: k6 `p95Ms` of the case's `main` run (`k6[0].p95Ms` in
`verdict.json`), in milliseconds. The median of three values is the middle value.

| Case / metric                               | 40896799127        | 40896827889        | 40896870640        | Median              |
| ------------------------------------------- | ------------------ | ------------------ | ------------------ | ------------------- |
| `TW-BG-FOUNDATION` p95 (ms)                 | 12.047             | 16.275             | 11.979             | **12.047**          |
| `P6-TW-LOAD-004` p95 (ms)                   | 33.126             | 33.472             | 34.425             | **33.472**          |
| `P6-TW-LOAD-006` p95 (ms)                   | 8.681              | 11.931             | 9.504              | **9.504**           |
| `P6-TW-LOAD-006` recovery to first 200 (ms) | 1007               | 1306               | 1009               | **1009**            |
| `P6-TW-LOAD-006` 429s in the above phase    | 102                | 101                | 102                | **102**             |
| `P6-TW-LOAD-009` p95 (ms)                   | 7.420              | 10.230             | 7.056              | **7.420**           |
| `P6-TW-LOAD-004` variant B lost share       | 361 / 724 (0.4986) | 362 / 725 (0.4993) | 361 / 723 (0.4993) | **0.4993 (49.9 %)** |

Values are the fields `k6[0].p95Ms`, `stages.reconcile.data.lostUpdate.variantB` (`verdictReason` gives
`lostLower` and `acked`) and `recovery.json` `recoveryMs` / `phases.json` `s429` of each run.

Environment label for every row: GitHub-hosted `ubuntu-24.04` (image `20261026.354.1` per `run-meta.json`),
4 vCPU, 15 984 MB RAM, k6 `2.3.0`, harness `v0.2.18`, Node `v22.23.4`, Twenty fork `7cbdfec6`, Twenty image
`v2.44.0`, event `workflow_dispatch` on `main`. Limiter profile: `functional` for the foundation and `P6-TW-LOAD-004`;
`productionLike` for `P6-TW-LOAD-006` and `P6-TW-LOAD-009` (`run-meta.json` `limiterProfile`).

## 2. Verdict table

| Case                                  | Status in this closeout                                    | Evidence (run ids are the three runs above)           |
| ------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| `TW-BG-FOUNDATION`                    | PASS, VALID (functional load, not capacity; not a P6 ID)   | all 3 runs                                            |
| `P6-TW-LOAD-004`                      | Variant A PASS; variant B **FINDING** (silent lost update) | all 3 runs; `reconcile.data.lostUpdate`               |
| `P6-TW-LOAD-005`                      | **Known failure**, linked to `P6-TW-RACE-004` (ID only)    | all 3 runs, `verdict-public.json`                     |
| `P6-TW-LOAD-006` (production-like)    | PASS, VALID                                                | all 3 runs                                            |
| `P6-TW-LOAD-009` (accepted extra)     | **FINDING** (cross-key starvation at image defaults)       | all 3 runs; `reconcile.data.fairness`                 |
| `P6-TW-LOAD-011` (accepted extra)     | PASS, VALID                                                | all 3 runs, `verdict-public.json`                     |
| `P6-TW-LOAD-008` (gated)              | NOT RUN, Later (gate evidence in §6)                       | none                                                  |
| `P6-TW-LOAD-010` (gated)              | NOT RUN, Later (gate evidence in §6)                       | none                                                  |
| `P6-X-LOAD-009` (A/A flags, accepted) | On-first PASS; off-first FAIL (twice); explained in §5     | `40850333800` PASS; `40848345879`, `40857206947` FAIL |

Labels (rule 13): the `-005` finding is a PRODUCT BUG (SUSPECTED) with a private report. `-004` variant B and
`-009` are FINDINGs. They are never called passes.

## 3. Contradictions and open points (decide before the build; see §8)

1. **The runner's outcome ignores two FINDINGs.** `src/load/runner.ts` `evaluateVerdict` reads only `reasons`,
   `invalid` and `notRun`. The stage data `lostUpdate.verdict` (`-004`) and `fairness.verdict` (`-009`) are
   written but never read. So `verdict.json` says `outcome: "PASS"` for both, while the stage data says
   `FINDING`. The README rule says "A deficit is `FINDING`, never a pass". The closeout reports the FINDING
   from the stage data and states the gap. Fixing `evaluateVerdict` is a code change to the runner and changes
   CI outcomes, so it is an owner decision (§8, item 1). This plan does not change the runner.
2. **The A/A off-first breach is not fully explained by arm order.** See §5.
3. **Phase 5 exit is not met yet.** The roadmap's exit needs ≥ 3 weekly soak points. There are 0 (§4). The
   closeout records `collecting (0/3 weeks)` and does not claim exit.
4. **Harness pin text differs.** `docs/plans/2026-10-29-p6-phase5-task3-twenty-load-foundation.md` §5 says H4 is
   in `v0.2.16`, pinned by Task 2. The runs record `harness: v0.2.18`. The README uses `v0.2.18` (the measured value).
5. **The roadmap says "nightly" runs; these are dispatches.** The Phase 5 exit and the `-004`, `-005`, `-011`
   "done when" lines say nightly. The three runs are `workflow_dispatch` on `main`, which the README rule
   allows ("main (push, schedule or workflow_dispatch)"). Recorded as a deviation, not a change.
6. **`EVIDENCE_WORKFLOW_IDS` comment is stale.** It names four workflows but the list has five ids (it includes
   `twenty-load`). Not edited here (it is CI).

## 4. Soak trend

- Weekly releases `p6-soak-<yyyy>-w<ww>` are published only by `soak-release.yml` on a completed 120-minute soak
  run on `main` (the Sunday 19:29 UTC `soak.yml` cron). Nothing is published on other days.
- Current state: no `p6-soak-*` release, so the README says **`collecting (0/3 weeks)`**.
- First weekly capture: **2026-11-01 UTC** (Sunday). Points needed on Sundays 2026-11-01, 11-08 and 11-15, so the
  earliest `trend` view is after 2026-11-15, if all three points are VALID.

## 5. A/A flags, `P6-X-LOAD-009` (evidence)

`tier-aa.yml` runs `P6-MED-LOAD-002` (steady, 120 s, 0.7 per second) three times per state. `off-first` puts flags
off in state 1 and on in state 2. `on-first` is the reverse. Verdict word from `aa-flags-verdict.ts`.

| Run id      | Order     | Verdict                   | p95 relative spread (tol 0.1) | p95 arm values (ms), state 1 / state 2              |
| ----------- | --------- | ------------------------- | ----------------------------- | --------------------------------------------------- |
| 40850333800 | on-first  | PASS                      | 0.0072                        | on 208.9 / 205.5 / 207.3; off 212.2 / 205.8 / 202.4 |
| 40848345879 | off-first | FAIL (p95)                | 0.1269                        | off 161.6 / 165.7 / 134.4; on 143.4 / 143.0 / 143.9 |
| 40857206947 | off-first | FAIL (p95) — evidence run | 0.1148                        | off 150.8 / 148.3 / 149.3; on 132.7 / 141.4 / 126.5 |
| 40845100209 | off-first | not counted: setup error  | —                             | Medusa HEAD mismatch and pnpm version (TEST BUG)    |

Reading (for the README):

- Flags-on arms were **faster** than flags-off arms in both off-first runs (medians 132.7 vs 149.3 ms, and
  143.4 vs 161.6 ms). The flags added no measurable latency in any run.
- The off-first FAIL is on the first state's p95 only. The on-first run shows no first-state penalty (state 1 median
  207.3 vs state 2 median 205.8 ms). So "arm order or warm-up" fits the two off-first runs but is **not**
  confirmed by the on-first run. The README says so; the cause is open (§8, item 2).

## 6. Later IDs and gate evidence

| ID                               | Status                                     | Gate evidence                                                                                                                                                                                                                                             |
| -------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P6-TW-LOAD-008`                 | NOT RUN, Later                             | Gate: H4 raises the limits so the stop rule ends the run. H4 is in the pinned harness and the six names reach the server (printenv). The 429 proof: defaults 41 × 429 at 4 rps; functional 0 × 429. API-key knee dry run not done.                        |
| `P6-TW-LOAD-010`                 | NOT RUN, Later                             | Gate: job state readable without writes. Read route proven (`LLEN`, `ZCARD`, `TYPE`, `SCAN` via `docker compose exec redis-cli`, P18). The monitor is not proven: 40 one-second samples saw no `bull:*:wait` key. Needs a finer sample or a queued burst. |
| `P6-TW-LOAD-007`                 | Later, out of P6                           | Owner decision: belongs with P1 (`/welcome` Playwright study).                                                                                                                                                                                            |
| `P6-TW-LOAD-001`, `-002`, `-003` | **Retired** (superseded by `-004`..`-006`) | Retired IDs are never reused.                                                                                                                                                                                                                             |
| `P6-X-LOAD-007`                  | **Retired** (withdrawn in Phase 3)         | Never reused.                                                                                                                                                                                                                                             |

## 7. Build steps (branch `docs/2026-10-29-p6-phase5-closeout`)

Each step is one commit. After each step run `npm run check` and check the unit count is still `# pass 1561`.
This build changes only Markdown, so the unit count must not move. If it does, stop and explain.

### Step 0: create the build branch

```bash
cd /home/user/k6-load-concurrency-suite
git fetch origin main
git checkout -B docs/2026-10-29-p6-phase5-closeout origin/main
git log --oneline -1
```

Expected: `f256d6e feat(load): mark P6-TW-LOAD-005 as a known failure (#177)` (or a later `main` head; if `main`
moved, note the new head in the PR).

### Step 1: `docs/releases/p6-phase5.md`

- **Path:** `docs/releases/p6-phase5.md` (NEW).
- **Shape:** first line `# P6 Phase 5 evidence (CI)`. It is the H1 that `evidence-release.yml` reads for the release title.
- **Links:** only the three `twenty-load` runs, as `https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/<id>`.
  `evidence-release.yml` stops unless the links equal `run_ids` exactly. Do **not** link the `tier-aa` runs
  (`40850333800`, `40848345879`, `40857206947`): they are not in the allowlist and the job would stop.
- **Also in the file:** the file list (`p6-<id>-evidence.zip`, `SHA256SUMS.txt`), the expected size (0.54 MB for
  three zips, §0 P-9), and the sentence that the Actions artefacts expire after 14 days and the release does not.
- **Commit:** `git add docs/releases/p6-phase5.md && git commit -m "docs(release): add the p6-phase5 evidence notes"`.

### Step 2: README "Phase 5 results"

- **Path:** `README.md`. Insert a new `## Phase 5 results` section **before** `## How to read a LOAD run`, after
  `## Phase 4 results` (search `grep -n "^## " README.md`).
- **Content, in this order:**
  1. One paragraph: every number is from a VALID `main` run; medians of 3 runs; environment labels (§1); the
     release link `https://github.com/Jayami123/k6-load-concurrency-suite/releases/tag/p6-phase5`, once it exists.
  2. The median table from §1 (copy the numbers exactly).
  3. The verdict table from §2 (IDs and labels as written there).
  4. `-004` variant B: write "Twenty's REST API has no optimistic concurrency (no version or `If-Match` check)".
     Give the variant B numbers from §1 and say it is a FINDING, never a pass. Say the outcome field reads PASS
     and why (§3 item 1).
  5. `-005`: the ID and "known failure, linked to `P6-TW-RACE-004`, details withheld". **No counts, mechanism,
     timing or repro.**
  6. `-009`: FINDING, cross-key starvation at image defaults (the fairness fields: low-rate client refused
     23/24, 19/25, 24/25; flood refused 197/401, 200/400, 197/401). Note the outcome field reads PASS (§3 item 1).
  7. A/A (§5): table and reading, with the open cause.
  8. Later and retired IDs (§6).
  9. Soak trend: `collecting (0/3 weeks)`, first capture 2026-11-01 UTC (§4).
  10. The change log against the master plan (D9): one bullet per change this closeout makes. The master plan
      itself is **not** edited.
- **Commit:** `git add README.md && git commit -m "docs(readme): record the phase 5 results"`.

### Step 3: upstream issue draft (draft only, never filed)

- **Path:** `docs/upstream/2026-10-29-twenty-lost-update-variant-b.md` (NEW). Use the sections of Twenty's
  `report-bug.md` template: `## Bug Description`, `## Expected behavior`, `## Technical inputs`. Put a header
  above them: `# Draft: silent lost update on REST update (P6-TW-LOAD-004 variant B)`, `Status: not filed`, and the
  finding ID `P6-TW-LOAD-004` variant B.
- **Framing:** "Twenty's REST API has no optimistic concurrency (no version or `If-Match` check)". Cite the fork
  pin (`7cbdfec6`) and the upstream HEAD of the recheck (`0c5752d`). Upstream grep result for `If-Match`, `ETag`
  and `optimistic` in the API code goes in the draft's Technical inputs; run it again on the filing day.
- **Numbers:** variant B acknowledged increments and lost increments per run (§1), the run ids, and the
  reproduction steps: `P6_TWENTY_LIMITER_PROFILE=functional node scripts/load/run-load.ts --case P6-TW-LOAD-004 --profile pr`.
- **Do not** include tokens, record names beyond the run prefix, or anything about `P6-TW-LOAD-005`.
- **Index:** add one row to the index table in `docs/upstream/README.md` for `P6-TW-LOAD-004` (variant B),
  channel "Public issue, `report-bug.md`", draft file above, status `draft`.
- **Commit:** `git add docs/upstream/2026-10-29-twenty-lost-update-variant-b.md docs/upstream/README.md && git commit -m "docs(upstream): draft the twenty lost update issue"`.

### Step 4: phase closeout record (rule 19)

- **Path:** `docs/plans/2026-10-29-p6-phase5-closeout.md` (NEW), from `docs/templates/phase-closeout.md`.
- Fill every section. "Model:" gets `not recorded in this repository` (no model identifiers in repo files).
- **Commit:** `git add docs/plans/2026-10-29-p6-phase5-closeout.md && git commit -m "docs(plans): add the phase 5 closeout record"`.

### Step 5: check, push, PR

```bash
cd /home/user/k6-load-concurrency-suite
export PATH="/usr/local/bin:$PATH"
npm run check; echo "exit=$?"          # expect exit=0 and "# pass 1561"
git push -u origin docs/2026-10-29-p6-phase5-closeout
gh pr create --base main --head docs/2026-10-29-p6-phase5-closeout --title "docs(p6): record the phase 5 closeout" --body-file <body.md>
```

The PR body mirrors the template in `.github/PULL_REQUEST_TEMPLATE.md` if one exists (none found at `f256d6e`;
write a plain body). No footer. No links to chat sessions.

### Step 6: CI, merge, cleanup

- Watch CI with the PR monitor (subscribe). Fix a real failure at its root; never weaken a check.
- Merge when CI is green: a merge commit titled exactly `<PR title> (#<n>)`, no footer.
- Delete the remote and local build branch `docs/2026-10-29-p6-phase5-closeout`. Never delete `plan/2026-10-29-p6-phase5-task8`.
- `git checkout main && git pull origin main`.

## 8. Open questions for the owner (proposed answers)

1. **Runner outcome for FINDINGs.** `evaluateVerdict` in `src/load/runner.ts` ignores `lostUpdate.verdict` and
   `fairness.verdict`, so `-004` and `-009` read `PASS`. Proposed answer: a separate `fix(load)` PR that makes a
   FINDING set the outcome word to `FINDING` and keeps the run VALID, with unit tests. Not in this closeout.
2. **A/A off-first breach.** Two off-first FAILs, one on-first PASS (§5). Proposed answer: record the breach as
   open, not explained, and re-run one off-first and one on-first `tier-aa` dispatch on `main` before the Phase 5
   exit. Flags-on was faster in both off-first runs, so no flag overhead is claimed.
3. **Phase 5 exit.** The soak trend needs 3 weekly points (earliest after 2026-11-15). Proposed answer: close Task 8
   as "exit pending soak trend" and list the exit as met on the day the third VALID point lands.
4. **Harness pin text.** Proposed answer: correct the `v0.2.16` line in the Task 3 plan through the next docs
   change (not in this closeout).
5. **Evidence release dispatch.** Proposed answer: the owner dispatches `evidence-release.yml` from `main` with
   `tag=p6-phase5`, `target_sha` = the merge commit of this PR, `run_ids` = the three `twenty-load` ids (§9).

## 9. Self-check (rule 20)

- (a) Roadmap "Done when" for Task 8: release exists (**pending owner dispatch**), README cites only VALID Actions
  runs (**yes**, §1 and §5 cite only VALID Actions runs and the A/A runs are cited as Actions runs with their
  verdict), `npm run check` green (**yes at baseline, 1561**), exit met (**no, soak 0/3**: §8 item 3).
- (b) Files named in this plan: `docs/plans/2026-10-22-p6-phase5-roadmap.md`, `docs/agent-rules.md`,
  `src/load/runner.ts` (`evaluateVerdict`), `.github/workflows/evidence-release.yml`, `.github/workflows/tier-aa.yml`,
  `docs/plans/2026-10-29-p6-phase5-task3-twenty-load-foundation.md`, `docs/templates/phase-closeout.md`,
  `docs/upstream/README.md`, `README.md`. All exist on `origin/main` at `f256d6e`. New: `docs/releases/p6-phase5.md`,
  `docs/upstream/2026-10-29-twenty-lost-update-variant-b.md`, `docs/plans/2026-10-29-p6-phase5-closeout.md`,
  `docs/plans/2026-10-29-p6-phase5-task8-closeout.md` (this file).
- (c) CI: no workflow change, so no CI time added. The release dispatch runs `evidence-release.yml` (30-minute
  job timeout; it downloads three runs and zips about 0.54 MB).
- (d) Every step lists exact paths, the commit command and the `npm run check` expectation (`exit=0`, `# pass 1561`).
- (e) Owner answers not given in this session are not recorded as decided. §8 lists them as open.
- Upstream check on the recheck day: the grep for `If-Match`, `ETag` and `optimistic` in the upstream API code is
  recorded in the step 3 draft. The fork's `common-update-one-query-runner.service.ts` has no version or `If-Match` check
  (Phase 2 roadmap).

## 10. Owner steps to dispatch the evidence release (after the PR merges)

1. Actions, `evidence-release`, Run workflow. Branch: `main`.
2. `tag`: `p6-phase5`
3. `target_sha`: the 40-character SHA of the merge commit of the closeout PR (on `main`).
4. `run_ids`: `40896799127 40896827889 40896870640`
5. Confirm the job passes and the release `p6-phase5` shows three zips and `SHA256SUMS.txt`. Then the Pages workflow
   publishes the dashboard.
