# P6 Phase 4 PRE-3: the evidence release accepts runs of `perf.yml` and `knee.yml` (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Rules: [docs/agent-rules.md](../agent-rules.md).

## 1. Header

- **Goal.** `.github/workflows/evidence-release.yml` accepts successful `main` runs of **either** `perf.yml` or `knee.yml`.
  - `PERF_WORKFLOW_ID: "376454455"` (line 38) becomes `EVIDENCE_WORKFLOW_IDS: "376454455 <knee id>"`.
  - The `run_ids` input description (line 15, "Space-separated perf.yml run ids on main") changes accordingly.
  - The `jq` check in "Check each run, then download its artefacts" (line 131) becomes an in-list check.
  - Same PR, required by the standing rule: the step caps of `evidence-release.yml` are brought down to a sum of at most 20 (job timeout 30, unchanged). Today they sum to 125 (§5).
- **Moved here from** Phase 4 Task 6 (its step 10 and its two `evidence-release-ids` tests). Task 6 only cites this plan.
- **Order.** **Right after Task 2 merges** (the `knee.yml` workflow id exists only then) and **before the first knee run set is released**. Phase 4 Task 5 and Task 6 and the releases depend on it.
- **Base.** `origin/main` after Task 2. **Build branch.** `ci/<build date>-p6-evidence-workflow-ids`. **Commit type.** `ci(evidence)`. **PR title.** `ci(evidence): accept knee.yml runs in the evidence release`.
- **Unit tests.** B = the count on `main` when the build starts. This plan adds **+2** (§4); expected B + 2.
- **Stop for owner review.** **Yes** (rule 10, index rule 10): a shared workflow that publishes releases. No harness pin and no shared runner label change.

## 2. Evidence

- `.github/workflows/evidence-release.yml` at `2db9726`: `PERF_WORKFLOW_ID: "376454455"` on line 38; the check reads `gh run view "$id" --json workflowDatabaseId,headBranch,conclusion,event,headSha` and runs
  `jq -e --argjson wf "$PERF_WORKFLOW_ID" '.workflowDatabaseId == $wf and .headBranch == "main" and .conclusion == "success"'`; the error text says "is not a successful perf.yml run on main"; the allowlist `find ... -delete` is line 140
  (kinds `json log csv html txt`).
- The `knee.yml` id: `curl -s https://api.github.com/repos/Jayami123/k6-load-concurrency-suite/actions/workflows/knee.yml | jq .id`. **UNPROBED: the file does not exist on `main` yet** (the command returns a 404 now); run it after Task 2 merges and write the number into the PR.
- Probed on 2026-10-25 with jq 1.7 on sample run JSON (`{"workflowDatabaseId": <id>, "headBranch": "main", "conclusion": "success"}`) and the new expression:

  | input                                           | exit code |
  | ----------------------------------------------- | --------- |
  | id `376454455` with `--arg ids "376454455 999"` | 0         |
  | id `999`                                        | 0         |
  | id `1`                                          | 1         |
  | id `376454455` on branch `feat`                 | 1         |

- The release that proved the current workflow: run 40189754385 (tag `p6-phase3`, 35 s). An earlier attempt, 40185739220, failed at the gitleaks scan before PR #68.

## 3. Design

```yaml
env:
  # …
  # Space-separated workflow database ids whose successful main runs may be released: perf.yml and knee.yml.
  EVIDENCE_WORKFLOW_IDS: "376454455 <knee id>"
```

```bash
          gh run view "$id" --json workflowDatabaseId,headBranch,conclusion,event,headSha > "$RUNNER_TEMP/run.json"
          jq -e --arg ids "$EVIDENCE_WORKFLOW_IDS" \
            '((.workflowDatabaseId|tostring) as $w | ($ids|split(" ")|index($w)) != null) and .headBranch == "main" and .conclusion == "success"' \
            "$RUNNER_TEMP/run.json" > /dev/null \
            || { echo "::error::run $id is not a successful perf.yml or knee.yml run on main"; exit 1; }
```

The `run_ids` description becomes "Space-separated perf.yml or knee.yml run ids on main". Everything else is untouched: the notes check (exact set match between the `actions/runs/<id>` links in `docs/releases/<tag>.md` and `run_ids`), the tag rule `^p6-[a-z0-9-]+$` (allows `p6-phase4a`), the allowlist, the token scan, gitleaks (`.gitleaks.toml`, PR #68), the zip step.
Excluded runs are written in the notes as plain ids in backticks, never as `actions/runs/` links.

**Dry run on a sample JSON** (before the PR, in the scratchpad): the four cases of §2 with the real `<knee id>`, plus the id of a third workflow (`jq` exit 1).

## 4. Steps and tests

`git switch -c ci/<build date>-p6-evidence-workflow-ids origin/main`; `export PATH="/usr/local/bin:$PATH"`.

| Step | Commit subject                                                      | `git add` paths                                                                  | Expected (`npm run check`)            |
| ---- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------- |
| 0    | `docs(plans): bring the phase 4 pre-3 plan onto the build branch`   | `docs/plans/2026-10-25-p6-phase4-pre3-evidence-workflow-ids.md`                  | exit 0, B                             |
| 1    | `ci(evidence): accept the runs of the knee workflow in the release` | `.github/workflows/evidence-release.yml tests/unit/evidence-release-ids.test.ts` | exit 0 (actionlint silent), **B + 2** |

`evidence-release-ids` (2, reads the workflow as text; no YAML parser is a dependency): (1) the file declares `EVIDENCE_WORKFLOW_IDS`, the value is two space-separated digit strings, the first is `376454455`; `PERF_WORKFLOW_ID` no longer appears; (2) no `--argjson wf` or
`workflowDatabaseId == $wf` single-id comparison remains and the `in-list` expression is present. Count **2**. Sample JSON for the dry run is inline in the test (no file).

## 5. CI cap table (G6): `evidence-release.yml`, job `publish`, timeout 30 (unchanged)

Measured step durations are from run 40189754385 (`p6-phase3`, three runs downloaded, the largest download so far), with the other two evidence-release runs for comparison (39589518902: 41 s total, download 23 s; 40185739220: failed at gitleaks after 7 s). A Phase 4a release downloads about 12 runs of 2 to 5 MB each, about four times
the Phase 3 download: estimates below scale the download and scan steps by 4 and are **UNPROBED** on the runner until the first Phase 4a release.

| step name (as in YAML)                                   | old cap | timeout-minutes | estimate (source)                                        | 80 % stop | runs on this event? |
| -------------------------------------------------------- | ------- | --------------- | -------------------------------------------------------- | --------- | ------------------- |
| Stop unless dispatched from main                         | 10      | 1               | 0 s (run 40189754385)                                    | 48 s      | workflow_dispatch   |
| Validate input formats                                   | 10      | 1               | 0 s (same)                                               | 48 s      | workflow_dispatch   |
| `actions/checkout@3d3c42e5…` (fetch-depth 0)             | 5       | 1               | 1 s (same; 3 s in 39589518902)                           | 48 s      | workflow_dispatch   |
| Check that target_sha is on main                         | 10      | 1               | 0 s (same)                                               | 48 s      | workflow_dispatch   |
| Check that the notes list exactly the selected runs      | 10      | 1               | 0 s (same)                                               | 48 s      | workflow_dispatch   |
| Stop if the release or its tag already exists            | 10      | 1               | 1 s (same; 2 s in 39589518902)                           | 48 s      | workflow_dispatch   |
| Check each run, then download its artefacts              | 20      | 3               | 16 s for 3 runs (same); about 64 s for 12 runs, UNPROBED | 144 s     | workflow_dispatch   |
| Install gitleaks (pinned version, pinned sha256)         | 10      | 1               | 0 s (same)                                               | 48 s      | workflow_dispatch   |
| Project token scan (any hit stops the job before upload) | 10      | 1               | 2 s for 3 runs (same); about 8 s for 12, UNPROBED        | 48 s      | workflow_dispatch   |
| gitleaks scan (any hit stops the job before upload)      | 10      | 2               | 8 s for 3 runs (same); about 32 s for 12, UNPROBED       | 96 s      | workflow_dispatch   |
| Build one zip per run and the checksum file              | 10      | 1               | 1 s for 3 runs (same); about 4 s for 12, UNPROBED        | 48 s      | workflow_dispatch   |
| Create the release                                       | 10      | 2               | 3 s (same)                                               | 96 s      | workflow_dispatch   |

Sum of the old caps: 10 + 10 + 5 + 10 + 10 + 10 + 20 + 10 + 10 + 10 + 10 + 10 = **125** against the job timeout 30 (a pre-existing breach of the step-cap rule). Sum of the new caps: 1 + 1 + 1 + 1 + 1 + 1 + 3 + 1 + 1 + 2 + 1 + 2 = **16**, at most 20; job timeout 30 unchanged;
30 − 16 = **14 ≥ 10**. Every cap is lowered, none raised. A measured step above 80 % of its cap in the first Phase 4a release is a stop and report, never a silent raise. The job's concurrency group (`evidence-release-<tag>`) is untouched.

## 6. Done when

- [ ] `npm run check` exit 0 with B + 2 unit tests; `actionlint` silent.
- [ ] `EVIDENCE_WORKFLOW_IDS` holds `376454455` and the real `knee.yml` id (written from the `curl | jq .id` command, number in the PR body); the dry run of §3 gives 0 / 0 / 1 / 1 / 1 as in §2.
- [ ] The sum of the step caps of `evidence-release.yml` is 16 (script of PRE-2 §4: `python3 stepcaps.py .github/workflows/evidence-release.yml`), job timeout 30.
- [ ] A release of a `knee.yml` run set (first use: `p6-phase4a`, Task 6) passes the run check; until then the PR states that no `knee.yml` run exists to test with and relies on the dry run.
- [ ] Owner review done before the merge (shared workflow).

## 7. Risks

| ID  | Risk                                                           | Mitigation                                                                              |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| R1  | The wrong `knee.yml` id is written                             | the id comes from the API command above, quoted in the PR; the dry run uses the same id |
| R2  | The tighter caps trip on a 12-run download                     | the first Phase 4a release measures it; stop and report, no silent raise                |
| R3  | A later workflow (`soak.yml`, `gate.yml`) must be released too | append its id to the list in the PR that creates it                                     |

## 8. Decisions (owner, 2026-10-25)

- **Q5 of Task 6 (accepted).** Decided (owner, 2026-10-25): (a) a list of workflow ids — one workflow, one release; the change moves out of Task 6 into this PR.
- **Timing.** Decided (owner, 2026-10-25): right after Task 2 merges, before the first knee run set is released (the 90-day artefact retention of `knee.yml` and early release are Task 2 Q6).
- **Review.** Decided (owner, 2026-10-25): owner review stop (shared workflow).
- **Q1. Cap values.** Decided (owner, 2026-10-25): (a) the caps of §5, sum 16, margin 14. The download, token-scan and gitleaks estimates for 12 runs are UNPROBED; the first Phase 4a release measures them and a step above 80 % is a stop and report.
