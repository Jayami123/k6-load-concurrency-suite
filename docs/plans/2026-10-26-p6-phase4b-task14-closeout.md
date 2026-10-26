# P6 Phase 4b Task 14: Phase 4 closeout and release `p6-phase4` (plan only)

Roadmap: [2026-10-22-p6-phase4-roadmap.md](2026-10-22-p6-phase4-roadmap.md) lines 752 to 779 (Task 14), D11 (line 829), D14 (line 837). Written on `plan/2026-10-26-p6-phase4b-plans` from `origin/main` at `86dbbde` (merged into this branch at `fe09ba6`; re-checked 2026-10-26 against main 86dbbde). Probe date 2026-10-25 (UTC). **This is a closeout plan: it cannot be built until Tasks 1 to 13 have merged, so most of its inputs are UNPROBED here, and the plan says which.** Phase 4a's interim release `p6-phase4a` is released (tag at `0b41fa7`, released 2026-10-26 15:30 Asia/Colombo; checked with `git ls-remote --tags origin`).

## 1. Header

- **Task and roadmap line:** Phase 4b Task 14 (closeout), roadmap lines 752 to 779.
- **Cases:** all Phase 4 cases (evidence only); `P6-RULE-001` to `P6-RULE-006` checked and recorded.
- **Build branch pattern:** `docs/<build date>-p6-phase4-closeout` (roadmap Task 14 table). The release notes go in their own `chore(release)` PR (index run order 15).
- **Unit-test delta:** **+0** (documentation and the release notes; the readme-rules test already covers the wording). The expected count is the count after Task 13 (1194).
- **Stop for owner review: yes.** The release is outward-facing: a tag (`p6-phase4`), a GitHub release, and the upstream drafts (drafts only, never filed).

## 2. What it proves

- Phase 4 is evidenced, not only merged: knee ranges for three products from VALID runs, A/A noise and the gate, the soaks and the invariants, each with run IDs and environment labels.
- Every rule of Phase 4 is checked on the record (`P6-RULE-001` to `-006`), with the gap listed where a rule is not met.
- Every open bug has evidence and an upstream draft (or a URL once filed by the owner).
- Transfer: the closing evidence pack a capacity-review or change-control board signs off, with its environment and its limits written down.

## 3. Live probe evidence

Probes here cover only what can be checked now, with the harness and the repo as they are on `main` at `86dbbde`.

| #   | Roadmap probe item                             | Command                                                                                                                                                         | Output (trimmed)                                                                                                                                                                                                | Value it sets                                                                                                                                         |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | Release tags on origin                         | `git ls-remote --tags origin`                                                                                                                                   | `p6-phase1`, `p6-phase3`, `p6-phase4a` (peels to `0b41fa7`, released 2026-10-26 15:30 Asia/Colombo)                                                                                                             | `p6-phase4a` exists; `p6-phase4` is ahead                                                                                                             |
| R-2 | Release notes present                          | `ls docs/releases`                                                                                                                                              | `p6-phase1.md`, `p6-phase2.md`, `p6-phase3.md`, `p6-phase4a.md` (present)                                                                                                                                       | `p6-phase4.md` is to be written; the template is `docs/templates/phase-closeout.md` (rule E19)                                                        |
| R-3 | The release filter and its allowlist           | `grep -n "allowlist\|json log csv html txt" .github/workflows/evidence-release.yml`                                                                             | the allowlist `json log csv html txt` (line 140, PR #63)                                                                                                                                                        | D14 is in place: HTML charts and CSV telemetry reach the release; `*.json.gz` does not (L5)                                                           |
| R-4 | The release workflow's ids                     | `grep -n "EVIDENCE_WORKFLOW_IDS" .github/workflows/evidence-release.yml`                                                                                        | `"376454455 396253729"` (perf.yml and knee.yml, line 39)                                                                                                                                                        | `soak.yml` and `gate.yml` ids are added by their `ci(evidence)` PRs (L4); the test `tests/unit/evidence-release-ids.test.ts` line 8 changes with them |
| R-5 | Upstream drafts exist and say "not filed"      | `head -3 docs/upstream/*.md`                                                                                                                                    | `2026-10-25-cal-link-usage-mismatch.md` (Cal bug report, `.github/ISSUE_TEMPLATE/bug_report.md`); `2026-10-25-documenso-duplicate-seal.md` (Documenso bug-report form, `.github/ISSUE_TEMPLATE/bug-report.yml`) | the Cal template exists in the Cal fork (`/home/user/products/cal/.github/ISSUE_TEMPLATE/`: `bug_report.md`, `config.yml`, `feature_request.md`)      |
| R-6 | The Documenso template                         | `ls /home/user/products/documenso/.github/ISSUE_TEMPLATE`                                                                                                       | S4 (2026-10-26): `bug-report.yml`, `config.yml`, `deploy-provider-request.yml`, `feature-request.yml`, `improvement.yml`                                                                                        | the Documenso draft's template match is `bug-report.yml` (the form the 2026-10-25 draft uses); re-read at build                                       |
| R-7 | The Phase 4a results section in README         | `grep -n "Phase 4a results\|Phase 4 results" README.md`                                                                                                         | `## Phase 4a results` at README line 722 (present)                                                                                                                                                              | the 4a section is present (README line 722); the "Phase 4 results" section is NEW in this closeout                                                    |
| R-8 | The three knee reports for the Documenso range | the released runs 40290101719, 40291101493 and 40291950598 (the `p6-phase4a` release assets, fetched with curl and checked against `SHA256SUMS.txt`, read-only) | lower 4, upper 5, stop p95 at step 4                                                                                                                                                                            | a Documenso range exists in the release; the `knee-bounds.json` entry is written by the bound PR (step 0b)                                            |

### 3.1 What the probe could not confirm (UNPROBED: confirm at build time, after the inputs exist)

1. Every run ID and verdict of Phase 4 (Tasks 2 to 13): none exists yet on the branch's base; the closeout cites only VALID GitHub Actions runs with labels, read from the artefacts at build time.
2. The release size with telemetry and charts (roadmap probe item): the 4a and 4b artefacts do not exist; estimate from the probes: a chart is about 12 KB (Task 13 S-1), telemetry JSON about 92 KB for a 2-min run (Task 7 M-3) and about 5.3 MB for a 2-h soak (Task 7 §3.1), so the release is dominated by the 2-h soak telemetry: **confirm the size when the zips exist**.
3. Each product's issue template (R-6 for Documenso).

## 4. Depends on

Tasks 1 to 13 merged (exact PRs and SHAs recorded at build time), plus the released `p6-phase4a` (`0b41fa7`) and the `ci(evidence)` PRs for `soak.yml` and `gate.yml`. On main at `86dbbde`: `docs/releases/p6-phase3.md` (the template for the new notes), `docs/templates/phase-closeout.md` (rule E19), `evidence-release.yml` (tag rule `^p6-[a-z0-9-]+$` at line 27 of its concurrency group and the input description at line 7), `README.md` ("Phase 3 results", "How to read a LOAD run", "How to read a knee", "Steady baselines"), `tests/unit/readme-rules.test.ts` (no bare "capacity").

**4a lessons applied** (each is checked by the build step it names):

- `DANGEROUS_BYPASS_RATE_LIMITS` defaults to true (`scripts/harness.mjs` line 33, `||=`); this closeout runs no case.
- `no_reference` → INVALID, never PASS: a rule with no cited reference is "not met", not "met" (§6.2).
- `low_sample_stop` and the stop-step zero post-trim limitation are listed where a cited knee range rests on them (§6.2, README).
- Config-used tests: none new (§12, +0).
- k6 has no URL global (no k6 code in this task).
- Cleanup never runs inside a limiter window under test (no cleanup in this task).
- Per-intent audit with no slack: each cited verdict is read from its own run (§14 item 2).
- The F-M2 ghost flag (Medusa) is listed as UNEXPLAINED with its cause UNPROBED, never a product bug.
- "knee range" wording, never "capacity" (R10; `tests/unit/readme-rules.test.ts`).
- CI budget rules: this task changes no workflow; the release is the owner's dispatch of `evidence-release.yml`.
- The owner dispatches in the UI and pastes the run ids.

## 5. Build-time recheck table

| #   | Check                                                    | Exact command                                                                                                        | Expected               | If it differs                                                                            |
| --- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| 1   | Tasks 1 to 13 merged                                     | `git log --oneline origin/main \| head -40` and the PR list                                                          | each task's PR present | a missing task is listed as "not done" in the README and the release notes, never hidden |
| 2   | `p6-phase4a` released                                    | `git ls-remote --exit-code origin refs/tags/p6-phase4a`                                                              | present (`0b41fa7`)    | the Phase 4a exit is not met; the closeout says so                                       |
| 3   | Workflow ids for the release                             | the session's GitHub tools (list the repository workflows) or the owner pastes the ids for `soak.yml` and `gate.yml` | integers               | the `ci(evidence)` PRs have not merged: the release check fails on them                  |
| 4   | D14 allowlist unchanged                                  | `grep -n "json log csv html txt" .github/workflows/evidence-release.yml`                                             | present                | a blocker reported to the owner (roadmap line 769), not a fix here                       |
| 5   | Every VALID run cited has `run-meta.json` with its label | the verdict and run-meta of each cited run (artefact download)                                                       | present for each       | the run is not cited; the gap is listed                                                  |
| 6   | `npm run check`                                          | `npm run check`                                                                                                      | exit 0                 | fix                                                                                      |

## 6. Design

### 6.1 File tree

```text
docs/releases/p6-phase4.md                        NEW  the final release notes (the template of p6-phase3.md)
docs/plans/2026-10-26-p6-phase4-closeout.md       NEW  the closeout record (rule E19), the phase closeout template
README.md                                         CHANGED  "Phase 4 results" (knee ranges, baselines, spikes, soaks, invariants, gate, dashboard, INVALID runs listed, the master-plan replacement); the rule status table
docs/upstream/<date>-*.md                         CHANGED  drafts only: any new confirmed bug gets a draft in its product's template; never filed
tests/unit/readme-rules.test.ts                   UNCHANGED (the bare "capacity" rule applies to the new README text)
```

### 6.2 The rule status (`P6-RULE-001` to `-006`)

Each rule is checked from the record (a file or a run ID), and the status is `met`, `met with a gap` (the gap listed), or `not met`:

| Rule        | Text (roadmap)                                                                                           | Check (what to read)                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| P6-RULE-001 | Measure only; no threshold on a steady baseline (`baseline-band.json` is "a record, not a gate", README) | the steady cases have no k6 threshold on latency: `grep -n "p(95)" k6/cases/*steady*` (none) and the band file's note |
| P6-RULE-002 | Every LOAD case has a correctness oracle (roadmap rules)                                                 | each case in the release notes names its audit (`audit.json`)                                                         |
| P6-RULE-003 | Each published number carries its environment label and `run-meta.json`                                  | the release notes list each run with `run-meta.json`                                                                  |
| P6-RULE-004 | No A/B gate before an A/A set; the tolerance cites its runs                                              | `tests/unit/gate-rule-004.test.ts` (Task 11) and `k6/thresholds/tolerance.json`                                       |
| P6-RULE-005 | Median of at least three VALID runs; INVALID runs excluded and listed                                    | `selectPublishable` (`src/load/medians.ts`) and the INVALID list of the README                                        |
| P6-RULE-006 | Knees are step ranges with stop rule and run IDs, never a single "max"                                   | `knee-bounds.json` (lower and upper bounds) and the knee reports                                                      |

Every "not met" or "met with a gap" is written into the closeout record and the README; none is hidden (rule of the roadmap).

### 6.3 Upstream drafts

For each confirmed PRODUCT BUG (the owner confirms; SUSPECTED stays SUSPECTED): a draft in the product's own template, under `docs/upstream/<date>-<product>-<slug>.md`, marked "Draft … Not filed. The owner files it." Existing drafts: `2026-10-25-cal-link-usage-mismatch.md` (Cal `bug_report.md`), `2026-10-25-documenso-duplicate-seal.md` (Documenso `bug-report.yml`). `P6-OBS-DOC-006` (suspected) gets a draft **only if the owner confirms it**. Nothing is filed by this task.

### 6.4 The release

The `chore(release)` PR adds `docs/releases/p6-phase4.md`. The release is dispatched by the owner: `evidence-release.yml` with `tag: p6-phase4`, `target_sha: <40-hex main SHA>`, and `run_ids: <the VALID runs cited>` (the workflow validates the tag `^p6-[a-z0-9-]+$`, the SHA, and the run IDs as digits; the runs must come from `main` and must be in `EVIDENCE_WORKFLOW_IDS`, including the `soak.yml` and `gate.yml` ids).

**Release input: the knee-bound runs.** The `p6-phase4` dispatch includes the knee-bound runs 40234172872 / 40235802167 / 40237156783 (`main`, `success`; created 2026-10-26 02:39–03:17 Asia/Colombo; not in `p6-phase4a`; the Actions artefacts expire 2027-01-24 02:39 Asia/Colombo). Otherwise the committed cal and medusa bound evidence is lost.

**Q-REL (release name).** The roadmap says `p6-phase4` (D11, lines 168 and 759); the owner's brief says "p6-phase4b". Decided: **`p6-phase4`** (D11); the tag rule `^p6-[a-z0-9-]+$` accepts both.

## 7. Oracles and assertions

Closeout oracles are the artefacts' own verdicts and audits: no new SQL. The release check of `evidence-release.yml` (membership in `EVIDENCE_WORKFLOW_IDS`, `main` only, digits-only ids, the token scan and gitleaks over the zips) is the gate.

## 8. Data isolation, cleanup and leak check

The closeout holds no data of its own. The release zips contain only the allowlisted files (`json log csv html txt`); the token scan and gitleaks run before the upload (in `evidence-release.yml`).

## 9. CI, token scan and budget

The release is `evidence-release.yml` (existing, not changed by this task); its budget is the one already on main (the release check of PRE-3 caps: `EVIDENCE_WORKFLOW_IDS` and its step caps, Phase 4a). This task changes no workflow. **Confirm in the first run:** the release size and its time with the 2-h soak telemetry (§3.1 item 2).

## 10. Expected output

The release notes and the README "Phase 4 results" section. Example headings (placeholders for every value):

```text
## Phase 4 results
### Knee ranges (P6-RULE-006)       <product>: between <s> and <s+1> iterations/s; stop <reason>; first saturated <resource>; runs <ids>
### Steady baselines (P6-CAL-LOAD-003, P6-MED-LOAD-002)   median of <n> VALID runs; band <min> to <max>; runs <ids>
### Spikes and recovery             <case>: recovery <t> s; contract <result>; runs <ids>
### Soaks (P6-CAL-LOAD-008, P6-MED-LOAD-005, P6-DOC-LOAD-006)   slope <v>; plateau <r>; DB growth <b>; runs <ids>
### Invariants under load           <case>: <verdict>; runs <ids>
### A/A and the gate (P6-RULE-004, P6-X-LOAD-003, P6-X-LOAD-008)   tolerance <t>; self-test <result>; runs <ids>
### Dashboard                       <url> (the owner's Pages URL)
### INVALID runs (listed, not used)   <run id>: <reason>
### Phase 4a and 4b master-plan replacement   stated in the release notes
```

## 11. Environment changes

None. Repo settings: the Pages source is set by the owner (Task 13). No cloud change.

## 12. Build order

| Step | Commit                                                                           | Files                                                                                   | Unit tests after the step               |
| ---- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------- |
| 1    | `docs(phase4): add the phase 4 closeout record`                                  | `docs/plans/2026-10-26-p6-phase4-closeout.md` (from `docs/templates/phase-closeout.md`) | unchanged (1194)                        |
| 2    | `docs(readme): add the phase 4 results`                                          | `README.md`                                                                             | unchanged (`readme-rules.test.ts` runs) |
| 3    | `chore(release): add the phase 4 evidence notes`                                 | `docs/releases/p6-phase4.md`                                                            | unchanged                               |
| 4    | the owner dispatches `evidence-release.yml` with `tag: p6-phase4` (not a commit) | —                                                                                       | —                                       |

**Expected unit-test count: unchanged** from the count after Task 13 (1194). `npm run check` must be exit 0 after each step.

## 13. Risks, proposed extras and open decisions

**Open decisions:**

- **Q-REL.** Decided: `p6-phase4` (D11).
- **Q-PHASE4A.** Resolved: released 2026-10-26 15:30 Asia/Colombo (tag `p6-phase4a` at `0b41fa7`); `docs/releases/p6-phase4a.md` and the README "## Phase 4a results" section exist, and the closeout cites them.
- **Q-RULE-GAP.** A rule that is "met with a gap" (for example P6-RULE-003 if one run lacks a label) is listed in the release notes, never forced to "met". Decided: list as met with a gap.

**Proposed extras:** none.

**Risks:**

- The release is only as complete as the runs it cites: an INVALID run resets a "≥ 3" count (roadmap risk); the closeout lists the INVALID runs, and the count is of VALID runs only.
- The release size with the 2-h soak telemetry (§3.1 item 2).
- An unfiled upstream draft is not an issue: the owner files it; the closeout does not claim a filing.

## 14. Done when (roadmap, made measurable)

Roadmap: "Exit met; release exists; README cites only VALID GitHub Actions runs with labels; RULE-001..006 checked and recorded; every open bug has evidence and an upstream draft or URL; `npm run check` green."

Measured: (1) the release `p6-phase4` exists (`git ls-remote --exit-code origin refs/tags/p6-phase4`, an exact ref lookup: a prefix grep also matches `refs/tags/p6-phase4a` and `refs/tags/p6-phase4b`, so it could pass before the tag exists) and `docs/releases/p6-phase4.md` is on main; (2) for each run ID cited in the README, the corresponding artefact is downloaded and its own `verdict.json` shows `validity.verdict` VALID and its own `run-meta.json` carries the environment label (the association is per run ID, checked by reading each artefact, not by a text match that could pair a run ID with another run's verdict); (3) §6.2 has a status for each of the six rules; (4) each open bug has a draft under `docs/upstream/` or a URL the owner supplies; (5) `npm run check` exit 0.

## 15. Rule self-check

- **A1 to A5:** plan branch, Conventional Commits, explicit paths, no attribution, environment identity.
- **B7 (probe first):** §3 has R-1 to R-8 with the real outputs; the cited runs are not yet on the branch base and are marked UNPROBED.
- **B9:** §13 lists three open decisions with recommendations.
- **B10:** stop for review (§1).
- **C12:** no rule is marked met where a gap exists; the gaps are listed.
- **D (reviews):** no PR comment or review is posted by this plan; drafts are for the owner.
- **Industry practice:** the release record with environment and run links follows the reproducible-evidence practice of the Google SRE book's postmortem and launch-review guidance; GitHub release and tag docs ("Managing releases in a repository").
- **F (plan self-check):** (a) roadmap "Done when" in §14; (b) names grep-verified in §3 (`evidence-release.yml` lines 7, 27, 39, 140; `tests/unit/evidence-release-ids.test.ts` line 8; `docs/templates/phase-closeout.md` present); (c) no CI change, so no budget (§9); (d) the release text skeleton is in §10; (e) no owner answer recorded as given (Q-REL is recommended, not decided).
